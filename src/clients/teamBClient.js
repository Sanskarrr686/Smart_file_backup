// src/clients/teamBClient.js

const config = require("../config/env");
const { request } = require("./httpClient");
const { dedupResults, verification } = require("../mocks/teamB");

async function getDedupResult(backupIdOrObject, options = {}) {
  if (config.teamB.mode === "mock") {
    const backupId = typeof backupIdOrObject === "object" ? backupIdOrObject.backup_id : backupIdOrObject;
    return dedupResults[backupId] || null;
  }

  let resultId = null;
  if (typeof backupIdOrObject === "object" && backupIdOrObject !== null) {
    resultId = backupIdOrObject.dedup_result_id || backupIdOrObject.result_id;
  } else if (typeof backupIdOrObject === "string") {
    if (backupIdOrObject.startsWith("ded_")) {
      resultId = backupIdOrObject;
    }
  }

  if (!resultId) {
    return { available: false };
  }

  const headers = {};
  if (options.correlationId) headers["X-Correlation-ID"] = options.correlationId;

  try {
    return await request(`${config.teamB.baseUrl}/api/v1/dedup/${encodeURIComponent(resultId)}`, { headers });
  } catch (err) {
    return { available: false };
  }
}

async function getVerification(backupId, options = {}) {
  if (config.teamB.mode === "mock") {
    return verification[backupId] || null;
  }

  const headers = {};
  if (options.correlationId) headers["X-Correlation-ID"] = options.correlationId;

  try {
    return await request(`${config.teamB.baseUrl}/api/v1/integrity/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ backup_id: backupId }),
    });
  } catch (err) {
    return { available: false };
  }
}

async function getChunkIndex(options = {}) {
  if (config.teamB.mode === "mock") {
    return {
      total_chunks: 128,
      indexed_chunks: 128,
      coverage_ratio: 1.0,
      healthy_chunks: 128,
      corrupted_chunks: 0,
    };
  }

  const headers = {};
  if (options.correlationId) headers["X-Correlation-ID"] = options.correlationId;

  return request(`${config.teamB.baseUrl}/api/v1/chunks/index`, { headers });
}

async function getDedupMetrics(options = {}) {
  if (config.teamB.mode === "mock") {
    return {
      total_deduped_gb: 42.5,
      global_savings_ratio: 0.31,
      avg_compute_ms: 120,
    };
  }

  const headers = {};
  if (options.correlationId) headers["X-Correlation-ID"] = options.correlationId;

  return request(`${config.teamB.baseUrl}/api/v1/metrics/dedup`, { headers });
}

async function computeDedup(payload, options = {}) {
  if (config.teamB.mode === "mock") {
    return {
      result_id: "ded_mock_" + Date.now(),
      unique_chunks: payload?.hashes?.length || 10,
      duplicate_chunks: 2,
      savings_ratio: 0.25,
    };
  }

  const headers = {};
  if (options.correlationId) headers["X-Correlation-ID"] = options.correlationId;

  return request(`${config.teamB.baseUrl}/api/v1/dedup/compute`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
  });
}

async function verifyIntegrity(payload, options = {}) {
  if (config.teamB.mode === "mock") {
    return {
      status: "VERIFIED",
      verified_chunks: payload?.chunks?.length || 12,
      corrupted_chunks: 0,
      merkle_root: payload?.merkle_root || "m_root_mock_123",
      timestamp: new Date().toISOString(),
    };
  }

  const headers = {};
  if (options.correlationId) headers["X-Correlation-ID"] = options.correlationId;

  return request(`${config.teamB.baseUrl}/api/v1/integrity/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
  });
}

module.exports = {
  getDedupResult,
  getVerification,
  getChunkIndex,
  getDedupMetrics,
  computeDedup,
  verifyIntegrity,
};