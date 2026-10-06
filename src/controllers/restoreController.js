// src/controllers/restoreController.js

const restoreService = require("../services/restoreService");
const { success } = require("../utils/response");

exports.listRestores = async (req, res, next) => {
  try {
    const result = await restoreService.listRestores(req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.getRestore = async (req, res, next) => {
  try {
    const { restoreId } = req.params;
    const restore = await restoreService.getRestoreById(restoreId, req.user);
    return success(res, restore);
  } catch (err) {
    next(err);
  }
};

exports.createRestore = async (req, res, next) => {
  try {
    const { fileId, versionId } = req.params;
    const restoreOp = await restoreService.createRestore(fileId, versionId, req.user);
    return success(res, restoreOp, 201);
  } catch (err) {
    next(err);
  }
};

exports.retryRestore = async (req, res, next) => {
  try {
    const { restoreId } = req.params;
    const restore = await restoreService.retryRestore(restoreId, req.user);
    return success(res, restore, 200);
  } catch (err) {
    next(err);
  }
};

