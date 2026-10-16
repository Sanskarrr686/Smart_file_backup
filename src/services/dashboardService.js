// src/services/dashboardService.js

const teamAClient = require("../clients/teamAClient");
const teamBClient = require("../clients/teamBClient");
const teamCClient = require("../clients/teamCClient");

async function getDashboard(user) {
  const { user_id, role } = user;

  const results = await Promise.allSettled([
    teamAClient.getQueue(),
    teamAClient.getMetrics(),
    teamCClient.getBackups(user_id, role),
    teamCClient.getStorageReport(),
    teamCClient.getFiles(user_id, role),
    teamCClient.getRestores(user_id, role),
  ]);

  const [queueRes, metricsRes, backupsRes, storageRes, filesRes, restoresRes] = results;

  const queue = queueRes.status === "fulfilled" ? queueRes.value : null;
  const schedulerMetrics = metricsRes.status === "fulfilled" ? metricsRes.value : null;
  const backups = backupsRes.status === "fulfilled" ? backupsRes.value : null;
  const storageReport = storageRes.status === "fulfilled" ? storageRes.value : null;
  const files = filesRes.status === "fulfilled" ? filesRes.value : null;
  const restores = restoresRes.status === "fulfilled" ? restoresRes.value : null;

  // Compute stats safely based on available data
  let completedCount = 0;
  let lastSuccessful = null;
  let totalBackups = 0;

  if (Array.isArray(backups)) {
    totalBackups = backups.length;
    const completed = backups.filter((b) => b.state === "COMMITTED" || b.state === "COMPLETED");
    completedCount = completed.length;
    lastSuccessful = completed.length ? completed[completed.length - 1].date : null;
  }

  // Deduplication & integrity aggregate check (Team B sample call or overall check)
  let dedupSummary = null;
  if (Array.isArray(backups) && backups.length > 0) {
    try {
      const sampleBackup = backups.find((b) => b.state === "COMPLETED" || b.state === "COMMITTED");
      if (sampleBackup) {
        const dedupData = await teamBClient.getDedupResult(sampleBackup.backup_id);
        if (dedupData) {
          dedupSummary = {
            available: true,
            sample_backup_id: sampleBackup.backup_id,
            savings_ratio: dedupData.savings_ratio,
            unique_chunks: dedupData.unique_chunks,
            duplicate_chunks: dedupData.duplicate_chunks,
          };
        }
      }
    } catch (e) {
      // Team B not available or no dedup result
    }
  }

  if (!dedupSummary) {
    dedupSummary = { available: false };
  }

  return {
    stats: {
      total_backups: backups !== null ? totalBackups : { available: false },
      completed_backups: backups !== null ? completedCount : { available: false },
      active_jobs: Array.isArray(queue) ? queue.length : { available: false },
      total_files: Array.isArray(files) ? files.length : { available: false },
      total_restores: Array.isArray(restores) ? restores.length : { available: false },
      storage_used_gb: storageReport && typeof storageReport.used_gb === "number" ? storageReport.used_gb : { available: false },
      last_successful_backup: backups !== null ? lastSuccessful : { available: false },
    },
    team_a: {
      available: queueRes.status === "fulfilled" && metricsRes.status === "fulfilled",
      queue: queue !== null ? queue : [],
      metrics: schedulerMetrics !== null ? schedulerMetrics : { available: false },
    },
    team_b: {
      deduplication_summary: dedupSummary,
    },
    team_c: {
      available: backupsRes.status === "fulfilled" && storageRes.status === "fulfilled",
      storage_chart: storageReport !== null ? storageReport : { available: false },
      recent_activity: Array.isArray(backups) ? backups.slice(-5).reverse() : [],
    },
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  getDashboard,
};
