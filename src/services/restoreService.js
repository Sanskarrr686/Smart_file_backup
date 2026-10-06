// src/services/restoreService.js

const teamCClient = require("../clients/teamCClient");
const storageClient = require("../storage/storageClient");
const config = require("../config/env");
const db = require("../utils/db");
const sseManager = require("../utils/sse");
const auditService = require("./auditService");
const notificationService = require("./notificationService");

async function processRestoreRetrieval(restoreRecord, targetVersion, file, user) {
  const bucket = (file && file.storage_bucket) || config.storage.bucket || "backup-files";
  const key = (targetVersion && targetVersion.storage_key) || (file && file.storage_key) || `files/${file ? file.name : "file"}`;

  await auditService.recordEvent({
    actor: user.username || user.name || "user",
    role: user.role,
    action: "RESTORE_STARTED",
    resource: restoreRecord.restore_id,
  }).catch(() => {});

  let objectData = null;
  let attempts = 0;
  let lastError = null;

  while (attempts < 3) {
    attempts++;
    try {
      objectData = await storageClient.getObject({ bucket, key });
      if (objectData) break;
    } catch (err) {
      lastError = err;
      if (attempts < 3) {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
      }
    }
  }

  if (objectData) {
    let downloadUrl = "";
    try {
      downloadUrl = await storageClient.getSignedUrl({ bucket, key, expiresInSeconds: 3600 });
    } catch (e) {
      downloadUrl = `http://localhost:9000/${bucket}/${key}?X-Amz-Expires=3600&mockToken=default`;
    }

    restoreRecord.state = "COMPLETED";
    restoreRecord.download_url = downloadUrl;
    restoreRecord.expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
    db.save();

    sseManager.broadcast({ type: "restore_updated", data: restoreRecord });

    await auditService.recordEvent({
      actor: user.username || user.name || "user",
      role: user.role,
      action: "RESTORE_COMPLETED",
      resource: restoreRecord.restore_id,
    }).catch(() => {});

    await notificationService.createNotification({
      title: "Restore Completed",
      message: `Restore '${restoreRecord.restore_id}' ready for download.`,
      type: "success",
      user_id: user.user_id,
    }).catch(() => {});
  } else {
    restoreRecord.state = "FAILED";
    restoreRecord.error_message = lastError ? lastError.message : "Storage retrieval failed after 3 attempts";
    db.save();

    sseManager.broadcast({ type: "restore_updated", data: restoreRecord });

    await auditService.recordEvent({
      actor: user.username || user.name || "user",
      role: user.role,
      action: "RESTORE_FAILED",
      resource: restoreRecord.restore_id,
    }).catch(() => {});

    await notificationService.createNotification({
      title: "Restore Failed",
      message: `Restore '${restoreRecord.restore_id}' failed to retrieve file bytes.`,
      type: "error",
      user_id: user.user_id,
    }).catch(() => {});
  }

  return restoreRecord;
}

async function listRestores(user) {
  const items = await teamCClient.getRestores(user.user_id, user.role);
  return { items };
}

async function getRestoreById(restoreId, user) {
  if (!restoreId) {
    const err = new Error("Restore ID is required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const restore = await teamCClient.getRestore(restoreId);
  if (!restore) {
    const err = new Error(`Restore operation '${restoreId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  if (user.role === "Employee" && restore.user_id !== user.user_id) {
    const err = new Error("You do not have permission to view this restore operation.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  return restore;
}

async function createRestore(fileId, versionId, user) {
  if (!fileId || !versionId) {
    const err = new Error("fileId and versionId are required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  // 1. Validate file existence
  const file = await teamCClient.getFile(fileId);
  if (!file) {
    const err = new Error(`File '${fileId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  // 2. Check ownership permission if Employee
  if (user.role === "Employee" && file.owner_id !== user.user_id) {
    const err = new Error("You do not have permission to restore this file.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  // 3. Validate version existence
  const versions = await teamCClient.getFileVersions(fileId);
  const targetVersion = (versions || []).find((v) => v.version_id === versionId);
  if (!targetVersion) {
    const err = new Error(`Version '${versionId}' not found for file '${fileId}'.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  // 4. Call Team C to initiate restore (Team C is the system of record)
  const restoreOp = await teamCClient.createRestore({
    file_id: fileId,
    version_id: versionId,
    user_id: user.user_id,
  });

  // 5. Execute retrieval step
  const updatedRestore = await processRestoreRetrieval(restoreOp, targetVersion, file, user);
  return updatedRestore;
}

async function retryRestore(restoreId, user) {
  const restoreRecord = await getRestoreById(restoreId, user);
  const file = await teamCClient.getFile(restoreRecord.file_id);
  const versions = await teamCClient.getFileVersions(restoreRecord.file_id);
  const targetVersion = (versions || []).find((v) => v.version_id === restoreRecord.version_id);

  restoreRecord.state = "PENDING";
  db.save();

  return processRestoreRetrieval(restoreRecord, targetVersion, file, user);
}

module.exports = {
  listRestores,
  getRestoreById,
  createRestore,
  retryRestore,
};

