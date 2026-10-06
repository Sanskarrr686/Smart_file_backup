const config = require("../config/env");
const { request } = require("./httpClient");

const { queue, metrics } = require("../mocks/teamA");

async function getQueue() {
  if (config.teamA.mode === "mock") {
    return queue;
  }

  return request(`${config.teamA.baseUrl}/api/v1/queue`);
}

async function getMetrics() {
  if (config.teamA.mode === "mock") {
    return metrics;
  }

  return request(`${config.teamA.baseUrl}/api/v1/metrics`);
}

module.exports = {
  getQueue,
  getMetrics,
};