// src/services/backupService.js

const teamCClient = require("../clients/teamCClient");
const teamBClient = require("../clients/teamBClient");
const teamAClient = require("../clients/teamAClient");
const config = require("../config/env");
const db = require("../utils/db");
const sseManager = require("../utils/sse");
const auditService = require("./auditService");
const notificationService = require("./notificationService");

// Idempotency memory store mapping key -> response payload
const idempotencyStore = new Map();

function triggerBackupProgression(backup, user) {
  const timer1 = setTimeout(() => {
    backup.state = "RUNNING";
    db.save();
    sseManager.broadcast({ type: "backup_updated", data: backup });

    const timer2 = setTimeout(async () => {
      // Small random failure chance (e.g., 10%)
      const isFailed = Math.random() < 0.1;
      backup.state = isFailed ? "FAILED" : "COMPLETED";
      db.save();

      sseManager.broadcast({ type: "backup_updated", data: backup });

      await auditService.recordEvent({
        actor: user.username || user.name || "user",
        role: user.role,
        action: isFailed ? "BACKUP_FAILED" : "BACKUP_COMPLETED",
        resource: backup.backup_id,
      }).catch(() => {});

      await notificationService.createNotification({
        title: isFailed ? "Backup Failed" : "Backup Completed",
        message: `Backup for '${backup.file_name}' ${isFailed ? "failed during execution." : "completed successfully."}`,
        type: isFailed ? "error" : "success",
        user_id: user.user_id,
      }).catch(() => {});
    }, 1200);

    if (timer2.unref) timer2.unref();
  }, 400);

  if (timer1.unref) timer1.unref();
}

async function listBackups(user, options = {}) {
  const res = await teamCClient.getBackups(user.user_id, user.role, options);
  if (res && res.upstream_unavailable) {
    return res;
  }
  return { items: Array.isArray(res) ? res : (res?.items || []) };
}

async function getBackupById(backupId, user) {
  if (!backupId) {
    const err = new Error("Backup ID is required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const backup = await teamCClient.getBackup(backupId);
  if (!backup) {
    const err = new Error(`Backup '${backupId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  if (user.role === "Employee" && backup.user_id !== user.user_id) {
    const err = new Error("You do not have permission to view this backup.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  // Enrich with Team B dedup and verification data if available
  let dedup = null;
  let verification = null;
  try {
    [dedup, verification] = await Promise.all([
      teamBClient.getDedupResult(backupId),
      teamBClient.getVerification(backupId),
    ]);
  } catch (e) {
    // Upstream failure from Team B should not break backup details retrieval
  }

  return {
    ...backup,
    dedup_info: dedup || { available: false },
    verification_info: verification || { available: false },
  };
}

async function createBackup({ file_id, file_name, user }, idempotencyKey, options = {}) {
  if (!idempotencyKey) {
    const err = new Error("Idempotency-Key header is required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  if (!file_id || !file_name) {
    const err = new Error("file_id and file_name are required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  // Idempotency check: return cached payload if available
  if (idempotencyStore.has(idempotencyKey)) {
    return { data: idempotencyStore.get(idempotencyKey), cached: true };
  }

  // Check file validity and ownership
  const file = await teamCClient.getFile(file_id);
  if (!file) {
    const err = new Error(`File '${file_id}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  if (user.role === "Employee" && file.owner_id !== user.user_id) {
    const err = new Error("You do not have permission to backup this file.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  const newBackup = await teamCClient.createBackup({
    file_id,
    file_name,
    user_id: user.user_id,
  }, options);

  // Store in idempotency cache
  idempotencyStore.set(idempotencyKey, newBackup);

  // Record audit log for BACKUP_STARTED
  await auditService.recordEvent({
    actor: user.username || user.name || "user",
    role: user.role,
    action: "BACKUP_STARTED",
    resource: newBackup.backup_id,
  }).catch(() => {});

  if (config.teamA.mode === "real") {
    try {
      await teamAClient.submitJob({
        job_id: `job_${newBackup.backup_id}`,
        backup_id: newBackup.backup_id,
        user_id: user.user_id,
        file_id,
        backup_type: "BACKUP",
        source_path: file.storage_key || `/files/${file_name}`,
        preferred_window: "ANY",
        priority: "NORMAL",
        estimated_duration_ms: 5000,
      }, { idempotencyKey, correlationId: options?.correlationId });
    } catch (err) {
      console.error("Failed to submit backup job to Team A:", err.message);
    }
  } else {
    // Trigger background progression QUEUED -> RUNNING -> COMPLETED/FAILED
    triggerBackupProgression(newBackup, user);
  }

  return { data: newBackup, cached: false };
}

module.exports = {
  listBackups,
  getBackupById,
  createBackup,
  idempotencyStore,
};

