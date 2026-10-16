// src/controllers/filesController.js

const path = require("path");
const config = require("../config/env");
const fileService = require("../services/fileService");
const storageClient = require("../storage/storageClient");
const { success, fail } = require("../utils/response");

exports.listFiles = async (req, res, next) => {
  try {
    const result = await fileService.listFiles(req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.getFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const file = await fileService.getFileById(fileId, req.user);
    return success(res, file);
  } catch (err) {
    next(err);
  }
};

exports.getVersions = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const result = await fileService.getFileVersions(fileId, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.uploadFile = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"];
    const result = await fileService.uploadFile({
      file: req.file,
      user: req.user,
      idempotencyKey,
    });
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

exports.getDownloadUrl = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const result = await fileService.getSignedDownloadUrl(fileId, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.downloadFile = async (req, res, next) => {
  try {
    const bucket = req.query.bucket || (config.storage && config.storage.bucket) || "backup-files";
    const key = req.query.key;

    if (!key) {
      return fail(res, 400, "VALIDATION_ERROR", "Query parameter 'key' is required.");
    }

    const fileData = await storageClient.getObject({ bucket, key });

    const contentType = fileData.contentType || "application/octet-stream";
    const filename = path.basename(key) || "download";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (fileData.size) {
      res.setHeader("Content-Length", fileData.size);
    }

    return res.send(fileData.buffer);
  } catch (err) {
    next(err);
  }
};

exports.verifyPreview = async (req, res, next) => {
  try {
    const teamBClient = require("../clients/teamBClient");
    const result = await teamBClient.verifyIntegrity(req.body, { correlationId: req.correlationId });
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
