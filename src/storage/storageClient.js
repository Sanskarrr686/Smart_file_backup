
const config = require("../config/env");
const mockStorage = require("./mockStorage");
const minioStorage = require("./minioStorage");

function getStorageAdapter() {
  const mode = String(config.storage?.mode || "mock").toLowerCase();

  if (mode === "minio" || mode === "real" || mode === "b2") {
    return minioStorage;
  }

  if (mode === "mock") {
    return mockStorage;
  }

  throw new Error(`Unsupported STORAGE_MODE: ${mode}`);
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
