// src/controllers/auditController.js

const auditService = require("../services/auditService");
const { success } = require("../utils/response");

exports.getAuditLog = async (req, res, next) => {
  try {
    const log = await auditService.getAuditLogs(req.correlationId);
    return success(res, log);
  } catch (err) {
    next(err);
  }
};
