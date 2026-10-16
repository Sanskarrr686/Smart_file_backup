// test/storage.test.js
// Automated tests for MinIO and Mock Storage Adapters

const test = require("node:test");
const assert = require("node:assert/strict");
const minioStorage = require("../src/storage/minioStorage");
const mockStorage = require("../src/storage/mockStorage");
const storageClient = require("../src/storage/storageClient");
const config = require("../src/config/env");

test("STORAGE: 1. Mock storage upload, get, exists, metadata and delete", async () => {
  const bucket = "test-bucket";
  const key = "test/sample.txt";
  const buffer = Buffer.from("Hello world storage test");

  const uploadRes = await mockStorage.uploadObject({ bucket, key, buffer, contentType: "text/plain" });
  assert.equal(uploadRes.provider, "mock");
  assert.equal(uploadRes.bucket, bucket);
  assert.equal(uploadRes.key, key);
  assert.ok(uploadRes.checksum);

  const exists = await mockStorage.objectExists({ bucket, key });
  assert.equal(exists, true);

  const meta = await mockStorage.getObjectMetadata({ bucket, key });
  assert.equal(meta.key, key);
  assert.equal(meta.size, buffer.length);

  const getRes = await mockStorage.getObject({ bucket, key });
  assert.equal(getRes.buffer.toString(), "Hello world storage test");

  const signedUrl = await mockStorage.getSignedUrl({ bucket, key });
  assert.ok(signedUrl.includes("/api/v1/ui/files/download"));

  const delRes = await mockStorage.deleteObject({ bucket, key });
  assert.equal(delRes.success, true);

  const existsAfterDelete = await mockStorage.objectExists({ bucket, key });
  assert.equal(existsAfterDelete, false);
});

test("STORAGE: 2. Storage client adapter selection based on mode", () => {
  const adapterDefault = storageClient.getAdapter();
  assert.ok(adapterDefault);
  const ref = storageClient.getStorageRef({ bucket: "b", key: "k" });
  assert.ok(ref.provider);
});

test("STORAGE: 3. Minio storage adapter unit error handling when unreachable", async () => {
  // Test minioStorage error handling with non-existent/invalid endpoint
  try {
    await minioStorage.getObject({ bucket: "nonexistent-bucket", key: "invalid-key.txt" });
    assert.fail("Should have thrown error");
  } catch (err) {
    assert.ok(err.status >= 400);
  }
});
