// src/services/auditService.js

const db = require("../utils/db");
const teamCClient = require("../clients/teamCClient");
const sseManager = require("../utils/sse");

async function recordEvent({ actor, role, action, resource, correlation_id, result = "SUCCESS" }) {
  const entry = {
    timestamp: new Date().toISOString(),
    user: actor || "unknown",
    role: role || "Employee",
    action: action || "UNKNOWN_ACTION",
    resource: resource || "N/A",
    result: result,
    correlation_id: correlation_id || "corr_sys",
  };

  if (!db.data.auditLog) {
    db.data.auditLog = [];
  }
  db.data.auditLog.unshift(entry);
  db.save();

  sseManager.broadcast({
    type: "audit_created",
    data: entry,
  });

  return entry;
}

async function getAuditLogs(reqCorrelationId) {
  const log = await teamCClient.getAuditLog();
  const formattedLogs = log.map((item) => ({
    timestamp: item.timestamp || new Date().toISOString(),
    user: item.user || item.actor || "unknown",
    role: item.role || (item.actor === "admin1" ? "IT Admin" : "Employee"),
    action: item.action || "UNKNOWN_ACTION",
    resource: item.resource || item.target || "N/A",
    result: item.result || "SUCCESS",
    correlation_id: item.correlation_id || reqCorrelationId || "corr_audit_sys",
  }));

  return { items: formattedLogs };
}

module.exports = {
  recordEvent,
  getAuditLogs,
};
