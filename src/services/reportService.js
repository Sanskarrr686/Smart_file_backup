// src/services/reportService.js

const teamCClient = require("../clients/teamCClient");
const teamAClient = require("../clients/teamAClient");
const teamBClient = require("../clients/teamBClient");

async function getStorageReport() {
  const report = await teamCClient.getStorageReport();
  return report;
}

async function getBackupReport() {
  const results = await Promise.allSettled([
    teamCClient.getBackups("admin", "IT Admin"),
    teamAClient.getQueue(),
    teamAClient.getMetrics(),
  ]);

  const [backupsRes, queueRes, metricsRes] = results;

  const backups = backupsRes.status === "fulfilled" ? backupsRes.value : [];
  const queue = queueRes.status === "fulfilled" ? queueRes.value : [];
  const metrics = metricsRes.status === "fulfilled" ? metricsRes.value : null;

  const total = backups.length;
  const completed = backups.filter((b) => b.state === "COMPLETED" || b.state === "COMMITTED").length;
  const failed = backups.filter((b) => b.state === "FAILED").length;
  const queued = queue.filter((q) => q.state === "QUEUED").length;
  const running = queue.filter((q) => q.state === "RUNNING").length;

  return {
    total_backups: total,
    completed,
    failed,
    queued,
    running,
    scheduler_metrics: metrics || { available: false },
    recent_backups: backups.slice(-10).reverse(),
  };
}

async function getIntegrityReport() {
  const backups = await teamCClient.getBackups("admin", "IT Admin");
  const completedBackups = backups.filter((b) => b.state === "COMPLETED" || b.state === "COMMITTED");

  const dedupResults = [];
  const verificationResults = [];

  for (const bkp of completedBackups) {
    try {
      const [dedup, verif] = await Promise.all([
        teamBClient.getDedupResult(bkp.backup_id),
        teamBClient.getVerification(bkp.backup_id),
      ]);
      if (dedup) dedupResults.push({ backup_id: bkp.backup_id, ...dedup });
      if (verif) verificationResults.push({ backup_id: bkp.backup_id, ...verif });
    } catch (e) {
      // safe fallback if Team B fails for a given backup
    }
  }

  return {
    deduplication_results: dedupResults,
    verification_results: verificationResults,
  };
}

module.exports = {
  getStorageReport,
  getBackupReport,
  getIntegrityReport,
};
