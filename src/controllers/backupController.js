// src/controllers/backupController.js

const backupService = require("../services/backupService");
const { success } = require("../utils/response");

exports.listBackups = async (req, res, next) => {
  try {
    const result = await backupService.listBackups(req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.getBackup = async (req, res, next) => {
  try {
    const { backupId } = req.params;
    const backup = await backupService.getBackupById(backupId, req.user);
    return success(res, backup);
  } catch (err) {
    next(err);
  }
};

exports.createBackup = async (req, res, next) => {
  try {
    const { file_id, file_name } = req.body;
    const idempotencyKey = req.headers["idempotency-key"];

    const result = await backupService.createBackup(
      { file_id, file_name, user: req.user },
      idempotencyKey
    );

    const statusCode = result.cached ? 200 : 201;
    return success(res, result.data, statusCode);
  } catch (err) {
    next(err);
  }
};
