// src/controllers/reportsController.js

const reportService = require("../services/reportService");
const { success } = require("../utils/response");

exports.getStorageReport = async (req, res, next) => {
  try {
    const report = await reportService.getStorageReport();
    return success(res, report);
  } catch (err) {
    next(err);
  }
};

exports.getBackupReport = async (req, res, next) => {
  try {
    const report = await reportService.getBackupReport();
    return success(res, report);
  } catch (err) {
    next(err);
  }
};

exports.getIntegrityReport = async (req, res, next) => {
  try {
    const report = await reportService.getIntegrityReport();
    return success(res, report);
  } catch (err) {
    next(err);
  }
};
