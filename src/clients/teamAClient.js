// src/clients/teamAClient.js

const config = require("../config/env");
const { request } = require("./httpClient");
const { queue, metrics } = require("../mocks/teamA");
const sseManager = require("../utils/sse");
const http = require("http");
const https = require("https");

async function getQueue(options = {}) {
  if (config.teamA.mode === "mock") {
    return queue;
  }

  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/backup/jobs`, { headers });
}

async function getMetrics(options = {}) {
  if (config.teamA.mode === "mock") {
    return metrics;
  }

  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/metrics/backup`, { headers });
}

async function submitJob(jobData, options = {}) {
  if (config.teamA.mode === "mock") {
    return {
      job_id: jobData.job_id || "job_mock",
      state: "REQUESTED",
      ...jobData,
    };
  }

  const headers = {};
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/backup/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(jobData),
  });
}

async function getJobStatus(jobId, options = {}) {
  if (config.teamA.mode === "mock") {
    const found = queue.find((j) => j.job_id === jobId);
    return found || { job_id: jobId, state: "RUNNING", progress: 50 };
  }

  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/backup/jobs/${encodeURIComponent(jobId)}`, { headers });
}

async function cancelJob(jobId, options = {}) {
  if (config.teamA.mode === "mock") {
    const found = queue.find((j) => j.job_id === jobId);
    if (found) found.state = "CANCELLED";
    return { job_id: jobId, state: "CANCELLED" };
  }

  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/backup/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers,
  });
}

async function getWorkers(options = {}) {
  if (config.teamA.mode === "mock") {
    return [];
  }

  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/workers`, { headers });
}

async function getWorkerQueue(workerId, options = {}) {
  if (config.teamA.mode === "mock") {
    return queue.filter((j) => j.assigned_worker === workerId);
  }

  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  return request(`${config.teamA.baseUrl}/api/v1/workers/${encodeURIComponent(workerId)}/queue`, { headers });
}

// Background SSE subscriber for Team A stream (real mode only)
let subscriberTimer = null;
let backoffMs = 1000;

function initTeamASubscriber() {
  if (config.teamA.mode !== "real" || !config.teamA.baseUrl) {
    return;
  }

  const streamUrl = `${config.teamA.baseUrl}/api/v1/stream/backup`;
  const clientLib = streamUrl.startsWith("https") ? https : http;

  function connect() {
    try {
      const req = clientLib.get(streamUrl, { headers: { Accept: "text/event-stream" } }, (res) => {
        if (res.statusCode !== 200) {
          console.error(`Team A stream returned status ${res.statusCode}`);
          scheduleReconnect();
          return;
        }

        backoffMs = 1000;
        let buffer = "";

        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              const dataStr = trimmed.slice(5).trim();
              if (dataStr) {
                try {
                  const eventData = JSON.parse(dataStr);
                  sseManager.broadcast(eventData);
                } catch (e) {
                  sseManager.broadcast({ type: "team_a_event", data: dataStr });
                }
              }
            }
          }
        });

        res.on("end", () => {
          scheduleReconnect();
        });

        res.on("error", (err) => {
          console.error("Team A stream error:", err.message);
          scheduleReconnect();
        });
      });

      req.on("error", (err) => {
        console.error("Team A stream request error:", err.message);
        scheduleReconnect();
      });
    } catch (err) {
      console.error("Failed to connect to Team A stream:", err.message);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (subscriberTimer) clearTimeout(subscriberTimer);
    subscriberTimer = setTimeout(() => {
      connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30000);
  }

  connect();
}

initTeamASubscriber();

module.exports = {
  getQueue,
  getMetrics,
  submitJob,
  getJobStatus,
  cancelJob,
  getWorkers,
  getWorkerQueue,
};