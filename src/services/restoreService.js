// src/services/restoreService.js

const teamCClient = require("../clients/teamCClient");
const teamAClient = require("../clients/teamAClient");
const storageClient = require("../storage/storageClient");
const config = require("../config/env");
const db = require("../utils/db");
const sseManager = require("../utils/sse");
const identityAdapter = require("../utils/identityAdapter");
const auditService = require("./auditService");
const notificationService = require("./notificationService");

async function processRestoreRetrieval(restoreRecord, targetVersion, file, user) {
  const bucket = (file && file.storage_bucket) || config.storage.bucket || "backup-files";
  const key = (targetVersion && (targetVersion.storage_key || targetVersion.object_key)) ||
              (file && (file.storage_key || file.object_key)) ||
              `files/${file ? file.name : "file"}`;

  await auditService.recordEvent({
    actor: user.username || user.name || "user",
    role: user.role,
    action: "RESTORE_STARTED",
    resource: String(restoreRecord.restore_id),
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
      resource: String(restoreRecord.restore_id),
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
      resource: String(restoreRecord.restore_id),
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

async function listRestores(user, options = {}) {
  const userIdForTeamC = config.teamC.mode === "mock"
    ? user.user_id
    : identityAdapter.getRequiredTeamCUserId(user);

  const res = await teamCClient.getRestores(userIdForTeamC, user.role, options);
  if (res && res.upstream_unavailable) {
    return res;
  }

  let items = Array.isArray(res) ? res : (res?.items || []);

  if (user.role === "Employee") {
    items = items.filter((r) => identityAdapter.matchesUser(r.user_id || r.owner_id, user));
  }

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

  if (user.role === "Employee" && !identityAdapter.matchesUser(restore.user_id || restore.owner_id, user)) {
    const err = new Error("You do not have permission to view this restore operation.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  return restore;
}

async function createRestore(fileId, versionId, user, options = {}) {
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
  if (user.role === "Employee" && !identityAdapter.matchesUser(file.owner_id || file.user_id, user)) {
    const err = new Error("You do not have permission to restore this file.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  // 3. Validate version existence
  const versionsRes = await teamCClient.getFileVersions(fileId);
  const versions = Array.isArray(versionsRes) ? versionsRes : (versionsRes?.versions || []);
  const targetVersion = versions.find((v) => String(v.version_id) === String(versionId));
  if (!targetVersion) {
    const err = new Error(`Version '${versionId}' not found for file '${fileId}'.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  const teamCUserId = config.teamC.mode === "mock"
    ? user.user_id
    : identityAdapter.getRequiredTeamCUserId(user);

  // 4. Call Team C to initiate restore
  const restoreOp = await teamCClient.createRestore({
    file_id: file.file_id || fileId,
    version_id: versionId,
    user_id: teamCUserId,
  }, options);

  if (config.teamA.mode === "real" || config.teamA.mode === "live") {
    try {
      await teamAClient.submitJob({
        job_id: `job_${restoreOp.restore_id}`,
        backup_id: restoreOp.restore_id,
        user_id: teamCUserId,
        file_id: file.file_id || fileId,
        backup_type: "RESTORE",
        source_path: targetVersion?.storage_key || targetVersion?.object_key || file?.storage_key || file?.object_key || `/files/${file.name}`,
        preferred_window: "ANY",
        priority: "HIGH",
        estimated_duration_ms: 3000,
      }, { correlationId: options?.correlationId });
    } catch (err) {
      console.error("Failed to submit restore job to Team A:", err.message);
    }
  }

  // 5. Execute retrieval step
  const updatedRestore = await processRestoreRetrieval(restoreOp, targetVersion, file, user);
  return updatedRestore;
}

async function retryRestore(restoreId, user) {
  const restoreRecord = await getRestoreById(restoreId, user);
  const file = await teamCClient.getFile(restoreRecord.file_id);
  const versionsRes = await teamCClient.getFileVersions(restoreRecord.file_id);
  const versions = Array.isArray(versionsRes) ? versionsRes : (versionsRes?.versions || []);
  const targetVersion = versions.find((v) => String(v.version_id) === String(restoreRecord.version_id));

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
