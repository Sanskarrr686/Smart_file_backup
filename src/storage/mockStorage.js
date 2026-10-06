// src/storage/mockStorage.js
// In-memory + disk-backed mock implementation of shared storage adapter

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config/env");

class MockStorage {
  constructor() {
    this.store = new Map();
    this.storageDir = path.join(process.cwd(), "data", "mock-storage");
    this._initDiskStorage();
  }

  _makeKey(bucket, key) {
    return `${bucket}/${key}`;
  }

  _getDiskPaths(bucket, key) {
    const safeKey = key.replace(/\\/g, "/");
    const filePath = path.join(this.storageDir, bucket, safeKey);
    const metaPath = `${filePath}.meta.json`;
    return { filePath, metaPath };
  }

  _initDiskStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      this._loadFromDisk(this.storageDir);

      // Seed default objects for mock files if store is empty or missing f_001 / f_003
      this._seedDefaultObjects();
    } catch (err) {
      console.error("[MockStorage] Error initializing disk storage:", err.message);
    }
  }

  _loadFromDisk(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this._loadFromDisk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".meta.json")) {
        try {
          const metaContent = fs.readFileSync(fullPath, "utf8");
          const metaRecord = JSON.parse(metaContent);
          const dataFilePath = fullPath.slice(0, -".meta.json".length);
          if (fs.existsSync(dataFilePath)) {
            const buffer = fs.readFileSync(dataFilePath);
            const record = {
              bucket: metaRecord.bucket,
              key: metaRecord.key,
              buffer,
              contentType: metaRecord.contentType || "application/octet-stream",
              metadata: metaRecord.metadata || {},
              size: buffer.length,
              checksum: metaRecord.checksum,
              etag: metaRecord.etag,
              uploadedAt: metaRecord.uploadedAt || new Date().toISOString(),
            };
            this.store.set(this._makeKey(record.bucket, record.key), record);
          }
        } catch (e) {
          // ignore corrupted metadata files
        }
      }
    }
  }

  _seedDefaultObjects() {
    const defaultBucket = "backup-files";
    const seedItems = [
      { key: "files/budget.xlsx", content: "Mock content for budget.xlsx version" },
      { key: "f_001", content: "Mock content for f_001" },
      { key: "v3", content: "Mock content for version v3" },
      { key: "v4", content: "Mock content for version v4" },
      { key: "files/design_assets.zip", content: "Mock content for design_assets.zip" },
      { key: "f_003", content: "Mock content for f_003" },
      { key: "v2", content: "Mock content for version v2" },
    ];

    for (const item of seedItems) {
      const fullKey = this._makeKey(defaultBucket, item.key);
      if (!this.store.has(fullKey)) {
        const buffer = Buffer.from(item.content);
        const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
        const etag = `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;
        const uploadedAt = new Date().toISOString();
        const record = {
          bucket: defaultBucket,
          key: item.key,
          buffer,
          contentType: "application/octet-stream",
          metadata: {},
          size: buffer.length,
          checksum,
          etag,
          uploadedAt,
        };
        this.store.set(fullKey, record);
        this._writeToDisk(record);
      }
    }
  }

  _writeToDisk(record) {
    try {
      const { filePath, metaPath } = this._getDiskPaths(record.bucket, record.key);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, record.buffer);
      const metaToSave = {
        bucket: record.bucket,
        key: record.key,
        contentType: record.contentType,
        metadata: record.metadata,
        size: record.size,
        checksum: record.checksum,
        etag: record.etag,
        uploadedAt: record.uploadedAt,
      };
      fs.writeFileSync(metaPath, JSON.stringify(metaToSave, null, 2));
    } catch (err) {
      console.error("[MockStorage] Error writing object to disk:", err.message);
    }
  }

  _removeFromDisk(bucket, key) {
    try {
      const { filePath, metaPath } = this._getDiskPaths(bucket, key);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch (err) {
      // ignore unlink errors
    }
  }

  async uploadObject({ bucket, key, buffer, contentType = "application/octet-stream", metadata = {} }) {
    if (!bucket || !key) {
      throw new Error("Storage upload error: bucket and key are required.");
    }
    if (!Buffer.isBuffer(buffer)) {
      buffer = Buffer.from(buffer || "");
    }

    const fullKey = this._makeKey(bucket, key);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const etag = `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;
    const uploadedAt = new Date().toISOString();

    const record = {
      bucket,
      key,
      buffer,
      contentType,
      metadata,
      size: buffer.length,
      checksum,
      etag,
      uploadedAt,
    };

    this.store.set(fullKey, record);
    this._writeToDisk(record);

    return {
      provider: "mock",
      bucket,
      key,
      size: buffer.length,
      etag,
      checksum,
      uploadedAt,
    };
  }

  async getObject({ bucket, key }) {
    const fullKey = this._makeKey(bucket, key);
    let record = this.store.get(fullKey);

    // Fallback: check by key alone if bucket match isn't strict
    if (!record) {
      for (const [k, v] of this.store.entries()) {
        if (v.key === key) {
          record = v;
          break;
        }
      }
    }

    if (!record) {
      const err = new Error(`Object '${key}' in bucket '${bucket}' not found in mock storage.`);
      err.code = "NoSuchKey";
      err.status = 404;
      throw err;
    }

    return {
      buffer: record.buffer,
      contentType: record.contentType,
      metadata: record.metadata,
      size: record.size,
      checksum: record.checksum,
      uploadedAt: record.uploadedAt,
    };
  }

  async getObjectMetadata({ bucket, key }) {
    const fullKey = this._makeKey(bucket, key);
    const record = this.store.get(fullKey);
    if (!record) {
      const err = new Error(`Object '${key}' in bucket '${bucket}' not found in mock storage.`);
      err.code = "NoSuchKey";
      err.status = 404;
      throw err;
    }

    return {
      bucket: record.bucket,
      key: record.key,
      contentType: record.contentType,
      metadata: record.metadata,
      size: record.size,
      checksum: record.checksum,
      etag: record.etag,
      uploadedAt: record.uploadedAt,
    };
  }

  async deleteObject({ bucket, key }) {
    const fullKey = this._makeKey(bucket, key);
    const existed = this.store.has(fullKey);
    this.store.delete(fullKey);
    this._removeFromDisk(bucket, key);
    return { success: true, deleted: existed };
  }

  async objectExists({ bucket, key }) {
    const fullKey = this._makeKey(bucket, key);
    if (this.store.has(fullKey)) return true;
    for (const [, v] of this.store.entries()) {
      if (v.key === key) return true;
    }
    return false;
  }

  async getSignedUrl({ bucket, key, expiresInSeconds = 3600, token }) {
    const exists = await this.objectExists({ bucket, key });
    if (!exists) {
      const err = new Error(`Object '${key}' in bucket '${bucket}' not found.`);
      err.code = "NoSuchKey";
      err.status = 404;
      throw err;
    }
    const authToken = token || "mock-token-u_101-default";
    const port = (config && config.port) || process.env.PORT || 4000;
    return `http://localhost:${port}/api/v1/ui/files/download?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}&token=${authToken}`;
  }

  getStorageRef({ bucket, key }) {
    return {
      provider: "mock",
      bucket,
      key,
    };
  }

  clearMockStore() {
    this.store.clear();
    try {
      if (fs.existsSync(this.storageDir)) {
        fs.rmSync(this.storageDir, { recursive: true, force: true });
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {
      // ignore
    }
    this._seedDefaultObjects();
  }
}

module.exports = new MockStorage();

