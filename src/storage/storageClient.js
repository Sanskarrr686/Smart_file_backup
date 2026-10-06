// src/storage/storageClient.js
// Storage client abstraction factory

const config = require("../config/env");
const mockStorage = require("./mockStorage");
const minioStorage = require("./minioStorage");

function getStorageAdapter() {
  const mode = (config.storage && config.storage.mode) ? config.storage.mode.toLowerCase() : "mock";
  if (mode === "minio") {
    return minioStorage;
  }
  return mockStorage;
}

module.exports = {
  uploadObject: (params) => getStorageAdapter().uploadObject(params),
  getObject: (params) => getStorageAdapter().getObject(params),
  getObjectMetadata: (params) => getStorageAdapter().getObjectMetadata(params),
  deleteObject: (params) => getStorageAdapter().deleteObject(params),
  objectExists: (params) => getStorageAdapter().objectExists(params),
  getSignedUrl: (params) => getStorageAdapter().getSignedUrl(params),
  getStorageRef: (params) => getStorageAdapter().getStorageRef(params),
  getAdapter: getStorageAdapter,
  mockStorage,
  minioStorage,
};
