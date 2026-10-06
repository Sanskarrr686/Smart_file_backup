# Integration Guide — Multi-Team Setup & Execution

## 1. Cross-Team File Flow Contract

This section defines the binding contract between Team A, Team B, Team C, and Team D so that each team can develop and deploy independently on separate machines.

| Team | Scope of Responsibility | Input Data | Output Data / Artifact |
|---|---|---|---|
| **Team D (BFF & UI)** | Upload UI, multipart API, shared storage upload, storage key generation, validation, Team C registration orchestration, state presentation. | User File Upload (`multipart/form-data`) | File bytes in Shared Storage + Storage Reference sent to Team C |
| **Team C (Metadata)** | System of record for file metadata, version history, backup status records, restore states, ownership. | Storage Reference + File Metadata from Team D | Authoritative File & Version Database (`POST /api/v1/files`) |
| **Team B (Engine)** | Real chunking, SHA-256 hashing, deduplication ratios, Merkle tree generation, integrity verification. | Shared Storage Reference (`provider`, `bucket`, `key`) | Chunk metadata, Merkle root, integrity report |
| **Team A (Scheduler)**| Backup job queueing, worker scheduling, execution monitoring, throughput metrics. | Backup Trigger Request (`file_id`, `user_id`) | Active Backup Queue (`/api/v1/queue`), Job Metrics |

---

## 2. Environment Configuration

Copy `.env.example` to `.env`:

```env
PORT=4000

TEAM_A_MODE=mock
TEAM_B_MODE=mock
TEAM_C_MODE=mock

TEAM_A_BASE_URL=http://localhost:5001
TEAM_B_BASE_URL=http://localhost:5002
TEAM_C_BASE_URL=http://localhost:5003

API_VERSION=v1

# Shared Storage Configuration
STORAGE_MODE=mock
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=backup-files
STORAGE_USE_SSL=false
STORAGE_MAX_SIZE_BYTES=104857600
```

---

## 3. Starting MinIO Shared Object Storage for Development

To test with real shared storage (`STORAGE_MODE=minio`):

### Step A: Launch MinIO Container via Docker
```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

### Step B: Create Storage Bucket
Access MinIO Console at `http://localhost:9001` (login: `minioadmin` / `minioadmin`) or use `mc` CLI:
```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/backup-files
```

---

## 4. Example Workflows & API Requests

### A. Team D Upload Request (`POST /api/v1/ui/files/upload`)
```http
POST /api/v1/ui/files/upload HTTP/1.1
Host: localhost:4000
Authorization: Bearer <employee_token>
Idempotency-Key: idem_fe_up_1727725000000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="project.zip"
Content-Type: application/zip

<file bytes>
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**Response (`201 Created`)**:
```json
{
  "data": {
    "file_id": "f_8f31c9",
    "name": "project.zip",
    "type": "file",
    "size_bytes": 25798912,
    "size_kb": 25194,
    "content_type": "application/zip",
    "owner_id": "u_101",
    "modified": "2026-09-30T22:35:00Z",
    "versions": 1,
    "storage_reference": {
      "provider": "minio",
      "bucket": "backup-files",
      "key": "files/2026/09/30/f_8f31c9/project.zip"
    },
    "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "status": "REGISTERED"
  },
  "meta": {
    "correlation_id": "corr_8f31c9a0",
    "api_version": "v1"
  }
}
```

### B. Team D Registration Request to Team C (`POST /api/v1/files`)
```json
{
  "file_id": "f_8f31c9",
  "name": "project.zip",
  "type": "file",
  "size_bytes": 25798912,
  "size_kb": 25194,
  "content_type": "application/zip",
  "owner_id": "u_101",
  "storage_provider": "minio",
  "storage_bucket": "backup-files",
  "storage_key": "files/2026/09/30/f_8f31c9/project.zip",
  "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "uploaded_at": "2026-09-30T22:35:00Z"
}
```

### C. Team B Shared Access URL Generation (`GET /api/v1/ui/files/:fileId/download-url`)
```json
{
  "data": {
    "file_id": "f_8f31c9",
    "name": "project.zip",
    "signed_url": "http://localhost:9000/backup-files/files/2026/09/30/f_8f31c9/project.zip?X-Amz-Expires=3600&...",
    "expires_in_seconds": 3600,
    "storage_reference": {
      "provider": "minio",
      "bucket": "backup-files",
      "key": "files/2026/09/30/f_8f31c9/project.zip"
    }
  }
}
```

---

## 5. Execution & Verification

Run backend tests:
```bash
npm test
```

Build React frontend:
```bash
cd frontend && npm run build
```

Run application locally:
```bash
npm start
```
Open browser at: `http://localhost:4000/`
