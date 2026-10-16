# Shared Storage Architecture — Team D BFF

## 1. Overview & Problem Statement

### Why Local Filesystem Paths are Unacceptable
In distributed enterprise architectures, using local filesystem paths such as:
`C:\Users\student\Downloads\project.zip` or `/home/student/file.zip`
is strictly unacceptable because:
1. **Machine Isolation**: A local path exists only on the uploading machine. Team B (running chunking/deduplication on a worker server) cannot access files located on an individual student's laptop.
2. **Persistence & Reliability**: Local laptop storage is temporary, non-replicated, and subject to client shutdown or file deletion.
3. **Security**: Exposing internal user laptop directory structures creates security vulnerabilities and leaks sensitive filesystem paths.

### Target Shared Storage Architecture
To support multi-team integration across Team A (Scheduler), Team B (Chunking/Dedup/Integrity), Team C (Metadata System of Record), and Team D (BFF & UI), Team D introduces an S3-compatible shared object storage layer:

```
User Computer / Browser
       │
       ▼ (multipart/form-data upload)
Team D BFF (`POST /api/v1/ui/files/upload`)
       │
       ├──► 1. Uploads File Bytes to Shared Object Storage (MinIO / S3)
       │       Key: `files/{yyyy}/{mm}/{dd}/{fileId}/{safeFileName}`
       │
       ├──► 2. Obtains Storage Reference `{ provider, bucket, key, checksum }`
       │
       └──► 3. Registers File Metadata with Team C (`POST /api/v1/files`)
               Team C stores metadata + storage reference (System of Record)
       
                                 ▲
                                 │ Accesses Shared Object Storage
                                 │
Team B (Worker) ─────────────────┘
Performs chunking, hashing, deduplication & integrity verification
```

---

## 2. Shared Storage Component Design

### Storage Abstraction Interface (`src/storage/`)
Team D implements a clean storage abstraction layer (`src/storage/storageClient.js`) that decouples application logic from specific storage implementations:

- `uploadObject({ bucket, key, buffer, contentType, metadata })`: Uploads object bytes to shared storage. Returns normalized storage reference.
- `getObject({ bucket, key })`: Retrieves object buffer, content type, and metadata from shared storage.
- `getObjectMetadata({ bucket, key })`: Retrieves metadata and headers without downloading body.
- `deleteObject({ bucket, key })`: Deletes object from storage bucket.
- `objectExists({ bucket, key })`: Verifies object existence in shared storage.
- `getSignedUrl({ bucket, key, expiresInSeconds })`: Generates temporary presigned download URL for Team B / clients.

### Storage Modes (`STORAGE_MODE`)
1. `STORAGE_MODE=mock`: In-memory storage adapter (`src/storage/mockStorage.js`). Used during local testing and development when MinIO is not running.
2. `STORAGE_MODE=minio`: Real S3-compatible MinIO storage adapter (`src/storage/minioStorage.js`). Connects to local or remote MinIO object storage instance.

---

## 3. Storage Object Key Design

Object keys follow a deterministic, partitioned hierarchical pattern:
`files/{yyyy}/{mm}/{dd}/{fileId}/{safeFileName}`

**Example**:
`files/2026/09/30/f_8f31c9/project.zip`

### Storage Reference Payload
```json
{
  "provider": "minio",
  "bucket": "backup-files",
  "key": "files/2026/09/30/f_8f31c9/project.zip"
}
```

---

## 4. Failure & Partial Failure Strategies

1. **Storage Upload Fails**:
   - Team D catches the error and aborts.
   - Team C file registration is **NOT** called. No orphan metadata is recorded.
   - Returns status `502 STORAGE_ERROR` with correlation ID.

2. **Storage Upload Succeeds but Team C Registration Fails**:
   - Team D catches Team C failure.
   - **Cleanup**: Team D immediately issues `deleteObject` to remove the uploaded file from shared storage, preventing orphaned object accumulation.
   - Returns status `502 UPSTREAM_FAILURE` to frontend:
     `"File uploaded to shared storage, but file registration with the metadata service could not be completed."`

3. **Team C Unavailable**:
   - Handled cleanly with HTTP 502 response and automatic object cleanup.

---

## 5. Security Principles
- Permanent storage access keys/secrets are **NEVER** returned in API responses or rendered on the React frontend.
- Filesystem path inputs from clients are rejected; filenames are sanitized (`path.basename` & illegal character filtering).
- Team B receives signed short-lived URLs (`getSignedUrl`) or accesses S3 directly using server-side storage references.
