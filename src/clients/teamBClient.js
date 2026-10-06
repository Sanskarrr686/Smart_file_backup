const config = require("../config/env");
const { request } = require("./httpClient");

const { dedupResults, verification } = require("../mocks/teamB");

async function getDedupResult(backupId) {
  if (config.teamB.mode === "mock") {
    return dedupResults[backupId] || null;
  }

  return request(
    `${config.teamB.baseUrl}/api/v1/backups/${encodeURIComponent(
      backupId
    )}/dedup`
  );
}

async function getVerification(backupId) {
  if (config.teamB.mode === "mock") {
    return verification[backupId] || null;
  }

  return request(
    `${config.teamB.baseUrl}/api/v1/backups/${encodeURIComponent(
      backupId
    )}/verification`
  );
}

module.exports = {
  getDedupResult,
  getVerification,
};