// src/storage/minioStorage.js
// MinIO / S3-compatible shared storage adapter

const Minio = require("minio");
const crypto = require("crypto");
const config = require("../config/env");

class MinioStorage {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  _getClient() {
    if (this.client) return this.client;

    const endpointUrl = config.storage.endpoint || "http://localhost:9000";
    let endPoint = "localhost";
    let port = 9000;
    let useSSL = config.storage.useSSL;

    try {
      const parsed = new URL(endpointUrl);
      endPoint = parsed.hostname;
      port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
      useSSL = parsed.protocol === "https:" || config.storage.useSSL;
    } catch {
      // Fallback defaults
    }

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
      region: config.storage.region || "us-east-1",
    });

    return this.client;
  }

  async _ensureBucketExists(bucket) {
    const client = this._getClient();
    try {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket, config.storage.region || "us-east-1");
      }
    } catch (err) {
      // If bucket checking/creation fails, wrap with actionable info
      const storageErr = new Error(`Failed to initialize or verify shared storage bucket '${bucket}': ${err.message}`);
      storageErr.code = "STORAGE_BUCKET_ERROR";
      storageErr.status = 502;
      throw storageErr;
    }
  }

  async uploadObject({ bucket = config.storage.bucket, key, buffer, contentType = "application/octet-stream", metadata = {} }) {
    if (!key) {
      throw new Error("Storage upload error: object key is required.");
    }
    if (!Buffer.isBuffer(buffer)) {
      buffer = Buffer.from(buffer || "");
    }

    await this._ensureBucketExists(bucket);
    const client = this._getClient();

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const metaHeaders = {
      "Content-Type": contentType,
      "x-amz-meta-checksum": checksum,
      ...metadata,
    };

    try {
      const objInfo = await client.putObject(bucket, key, buffer, buffer.length, metaHeaders);
      return {
        provider: "minio",
        bucket,
        key,
        size: buffer.length,
        etag: objInfo.etag || null,
        checksum,
        uploadedAt: new Date().toISOString(),
      };
    } catch (err) {
      const storageErr = new Error(`MinIO shared storage upload failed for key '${key}': ${err.message}`);
      storageErr.code = "STORAGE_UPLOAD_ERROR";
      storageErr.status = 502;
      throw storageErr;
    }
  }

  async getObject({ bucket = config.storage.bucket, key }) {
    const client = this._getClient();
    try {
      const stream = await client.getObject(bucket, key);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const stat = await client.statObject(bucket, key);
      return {
        buffer,
        contentType: stat.metaData?.["content-type"] || "application/octet-stream",
        metadata: stat.metaData || {},
        size: stat.size,
        checksum: stat.metaData?.["checksum"] || null,
        uploadedAt: stat.lastModified,
      };
    } catch (err) {
      const storageErr = new Error(`MinIO getObject failed for '${key}' in bucket '${bucket}': ${err.message}`);
      storageErr.code = err.code || "NoSuchKey";
      storageErr.status = err.code === "NoSuchKey" ? 404 : 502;
      throw storageErr;
    }
  }

  async getObjectMetadata({ bucket = config.storage.bucket, key }) {
    const client = this._getClient();
    try {
      const stat = await client.statObject(bucket, key);
      return {
        bucket,
        key,
        contentType: stat.metaData?.["content-type"] || "application/octet-stream",
        metadata: stat.metaData || {},
        size: stat.size,
        etag: stat.etag,
        checksum: stat.metaData?.["checksum"] || null,
        uploadedAt: stat.lastModified,
      };
    } catch (err) {
      const storageErr = new Error(`Object '${key}' not found in bucket '${bucket}': ${err.message}`);
      storageErr.code = err.code || "NoSuchKey";
      storageErr.status = err.code === "NoSuchKey" ? 404 : 502;
      throw storageErr;
    }
  }

  async deleteObject({ bucket = config.storage.bucket, key }) {
    const client = this._getClient();
    try {
      await client.removeObject(bucket, key);
      return { success: true };
    } catch (err) {
      const storageErr = new Error(`Failed to delete object '${key}' from bucket '${bucket}': ${err.message}`);
      storageErr.code = "STORAGE_DELETE_ERROR";
      storageErr.status = 502;
      throw storageErr;
    }
  }

  async objectExists({ bucket = config.storage.bucket, key }) {
    const client = this._getClient();
    try {
      await client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl({ bucket = config.storage.bucket, key, expiresInSeconds = 3600 }) {
    const client = this._getClient();
    try {
      return await client.presignedGetObject(bucket, key, expiresInSeconds);
    } catch (err) {
      const storageErr = new Error(`Failed to generate signed URL for '${key}': ${err.message}`);
      storageErr.code = "STORAGE_PRESIGN_ERROR";
      storageErr.status = 502;
      throw storageErr;
    }
  }

  getStorageRef({ bucket = config.storage.bucket, key }) {
    return {
      provider: "minio",
      bucket,
      key,
    };
  }
}

module.exports = new MinioStorage();
