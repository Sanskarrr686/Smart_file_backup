// src/services/fileService.js

const crypto = require("crypto");
const path = require("path");
const teamCClient = require("../clients/teamCClient");
const storageClient = require("../storage/storageClient");
const config = require("../config/env");
const sseManager = require("../utils/sse");
const identityAdapter = require("../utils/identityAdapter");
const auditService = require("./auditService");
const notificationService = require("./notificationService");

const uploadIdempotencyCache = new Map();

function sanitizeFilename(filename) {
  if (!filename || typeof filename !== "string") {
    return "uploaded_file.bin";
  }
  const basename = path.basename(filename).replace(/[\0\r\n\t]/g, "");
  const clean = basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return clean || "uploaded_file.bin";
}

function buildStorageKey(fileId, safeFileName) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `files/${yyyy}/${mm}/${dd}/${fileId}/${safeFileName}`;
}

async function listFiles(user) {
  const userIdForTeamC = config.teamC.mode === "mock"
    ? user.user_id
    : identityAdapter.getRequiredTeamCUserId(user);

  const rawRes = await teamCClient.getFiles(userIdForTeamC, user.role);
  let items = Array.isArray(rawRes) ? rawRes : (rawRes?.items || rawRes?.files || []);

  if (user.role === "Employee") {
    items = items.filter((f) => identityAdapter.matchesUser(f.owner_id || f.user_id, user));
  }

  return { items };
}

async function getFileById(fileId, user) {
  if (!fileId) {
    const err = new Error("File ID is required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const file = await teamCClient.getFile(fileId);
  if (!file) {
    const err = new Error(`File '${fileId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  // Employee can only access own files
  if (user.role === "Employee" && !identityAdapter.matchesUser(file.owner_id || file.user_id, user)) {
    const err = new Error("You do not have permission to view this file.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  return file;
}

async function getFileVersions(fileId, user) {
  if (!fileId) {
    const err = new Error("File ID is required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  // Validate file existence and access permission first
  const file = await getFileById(fileId, user);

  const versions = await teamCClient.getFileVersions(fileId);
  if (!versions || (Array.isArray(versions) && versions.length === 0)) {
    const err = new Error(`No versions found for file '${fileId}'.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  return { file_id: file.file_id || fileId, versions };
}

async function uploadFile({ file, user, idempotencyKey }) {
  if (!file || !file.buffer) {
    const err = new Error("No file provided in upload request.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  if (file.size === 0) {
    const err = new Error("Uploaded file is empty (0 bytes).");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const maxBytes = config.storage.maxSizeBytes || 100 * 1024 * 1024;
  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    const err = new Error(`File size exceeds maximum allowed limit of ${limitMb}MB.`);
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const safeFileName = sanitizeFilename(file.originalname);
  const contentType = file.mimetype || "application/octet-stream";

  // Fix idempotency key isolation per user and file parameters
  const cacheKey = idempotencyKey
    ? `${user.user_id}:${idempotencyKey}:${safeFileName}:${file.size}`
    : null;

  if (cacheKey && uploadIdempotencyCache.has(cacheKey)) {
    return uploadIdempotencyCache.get(cacheKey);
  }

  let result;

  if (config.teamC.mode === "real" || config.teamC.mode === "live") {
    // Live Team C multipart integration: forward file buffer directly to Team C
    const teamCUserId = identityAdapter.getRequiredTeamCUserId(user);

    let registered;
    try {
      registered = await teamCClient.uploadFileMultipart({
        fileBuffer: file.buffer,
        fileName: safeFileName,
        userId: teamCUserId,
        user,
        role: user ? user.role : undefined,
        locationId: config.teamC.locationId,
        policyId: config.teamC.policyId,
        contentType,
      });
    } catch (err) {
      await notificationService.createNotification({
        title: "File Upload Failed",
        message: `Failed to upload '${safeFileName}' to Team C: ${err.message}`,
        type: "error",
        user_id: user.user_id,
      }).catch(() => {});

      const upstreamErr = new Error(`Team C upload failed: ${err.message}`);
      upstreamErr.status = err.status || 502;
      upstreamErr.code = err.code || "UPSTREAM_FAILURE";
      upstreamErr.details = err.details || [err.message];
      throw upstreamErr;
    }

    const storageKey = registered.object_key || registered.storage_key;

    result = {
      file_id: registered.file_id,
      name: registered.file_name || registered.name || safeFileName,
      type: "file",
      size_bytes: file.size,
      size_kb: Math.round(file.size / 1024),
      content_type: contentType,
      owner_id: registered.user_id || user.user_id,
      modified: registered.created_at || registered.modified || new Date().toISOString(),
      versions: 1,
      storage_reference: {
        provider: "minio",
        bucket: registered.bucket || config.storage.bucket || "backup-files",
        key: storageKey,
      },
      object_key: storageKey,
      checksum: registered.checksum || null,
      status: "REGISTERED",
    };
  } else {
    // Mock mode: Upload object to Team D storage and register metadata
    const fileId = "f_" + crypto.randomBytes(4).toString("hex");
    const storageBucket = config.storage.bucket || "backup-files";
    const storageKey = buildStorageKey(fileId, safeFileName);

    let uploadRes;
    try {
      uploadRes = await storageClient.uploadObject({
        bucket: storageBucket,
        key: storageKey,
        buffer: file.buffer,
        contentType,
      });
    } catch (err) {
      await notificationService.createNotification({
        title: "File Upload Failed",
        message: `Failed to upload '${safeFileName}': ${err.message}`,
        type: "error",
        user_id: user.user_id,
      }).catch(() => {});

      const storageErr = new Error(`Shared storage upload failed: ${err.message}`);
      storageErr.status = err.status || 502;
      storageErr.code = err.code || "STORAGE_ERROR";
      throw storageErr;
    }

    const teamCPayload = {
      file_id: fileId,
      name: safeFileName,
      type: "file",
      size_bytes: file.size,
      size_kb: Math.round(file.size / 1024),
      content_type: contentType,
      owner_id: user.user_id,
      storage_provider: uploadRes.provider,
      storage_bucket: uploadRes.bucket,
      storage_key: uploadRes.key,
      checksum: uploadRes.checksum,
      uploaded_at: uploadRes.uploadedAt,
    };

    let registeredFile;
    try {
      registeredFile = await teamCClient.registerFile(teamCPayload);
    } catch (err) {
      await storageClient.deleteObject({ bucket: uploadRes.bucket, key: uploadRes.key }).catch(() => {});

      await notificationService.createNotification({
        title: "File Upload Failed",
        message: `Failed to register metadata for '${safeFileName}'.`,
        type: "error",
        user_id: user.user_id,
      }).catch(() => {});

      const regErr = new Error("File uploaded to shared storage, but file registration with the metadata service could not be completed.");
      regErr.status = 502;
      regErr.code = "UPSTREAM_FAILURE";
      regErr.details = [err.message];
      throw regErr;
    }

    result = {
      file_id: registeredFile.file_id,
      name: registeredFile.name,
      type: registeredFile.type || "file",
      size_bytes: file.size,
      size_kb: registeredFile.size_kb,
      content_type: contentType,
      owner_id: registeredFile.owner_id,
      modified: registeredFile.modified || new Date().toISOString(),
      versions: 1,
      storage_reference: {
        provider: uploadRes.provider,
        bucket: uploadRes.bucket,
        key: uploadRes.key,
      },
      checksum: uploadRes.checksum,
      status: "REGISTERED",
    };
  }

  if (cacheKey) {
    uploadIdempotencyCache.set(cacheKey, result);
  }

  await auditService.recordEvent({
    actor: user.username || user.name || "user",
    role: user.role,
    action: "FILE_UPLOADED",
    resource: result.name || String(result.file_id),
  }).catch(() => {});

  sseManager.broadcast({
    type: "file_uploaded",
    data: result,
  });

  return result;
}

async function getSignedDownloadUrl(fileId, user) {
  const file = await getFileById(fileId, user);
  const bucket = file.storage_bucket || config.storage.bucket || "backup-files";
  const key = file.storage_key || file.object_key || `files/${file.name}`;

  const signedUrl = await storageClient.getSignedUrl({
    bucket,
    key,
    expiresInSeconds: 3600,
  });

  return {
    file_id: file.file_id,
    name: file.name,
    signed_url: signedUrl,
    expires_in_seconds: 3600,
    storage_reference: {
      provider: file.storage_provider || config.storage.mode,
      bucket,
      key,
    },
  };
}

function clearUploadIdempotencyCache() {
  uploadIdempotencyCache.clear();
}

module.exports = {
  listFiles,
  getFileById,
  getFileVersions,
  uploadFile,
  getSignedDownloadUrl,
  clearUploadIdempotencyCache,
};
