// src/mocks/teamC.js
//
// Stands in for Team C (Metadata, Version & Restore Manager).
// Backed by persistent JSON database store ./data/db.json.

const db = require("../utils/db");

module.exports = {
  files: db.data.files,
  fileVersions: db.data.fileVersions,
  backups: db.data.backups,
  restores: db.data.restores,
  storageReport: db.data.storageReport,
  auditLog: db.data.auditLog,
  notifications: db.data.notifications,
  db,
};

