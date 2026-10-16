# API Contract — Team D Backend-for-Frontend (BFF) & Upstream Services

Version: `v1`  
Base URL Path (BFF): `/api/v1/ui`

---

## 1. Response Envelopes

### Success Response (`200 OK`, `201 Created`)
```json
{
  "data": { ... },
  "meta": {
    "correlation_id": "corr_abc123def456",
    "api_version": "v1"
  }
}
```

### Error Response (`400`, `401`, `403`, `404`, `409`, `422`, `500`, `502`, `504`)
```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human readable description of the error",
    "details": []
  },
  "meta": {
    "correlation_id": "corr_abc123def456"
  }
}
```

---

## 2. Role Access Matrix

| Category | Endpoint | Verb | Employee | IT Admin | Auditor |
|---|---|---|:---:|:---:|:---:|
| **Auth** | `/session` | POST | Allowed | Allowed | Allowed |
| | `/session` | DELETE | Allowed | Allowed | Allowed |
| | `/me` | GET | Allowed | Allowed | Allowed |
| | `/session/change-password` | POST | Allowed | Allowed | Allowed |
| **Dashboard** | `/dashboard` | GET | Allowed | Allowed | Allowed |
| **Files** | `/files` | GET | Own Files | All Files | All Files |
| | `/files/:fileId` | GET | Own File | All Files | All Files |
| | `/files/:fileId/versions` | GET | Own File | All Files | All Files |
| **Backups** | `/backups` | GET | Own Backups | All Backups | All Backups |
| | `/backups/:backupId` | GET | Own Backup | All Backups | All Backups |
| | `/backups` | POST | Allowed | Allowed | Forbidden |
| **Restores** | `/restores` | GET | Own Restores | All Restores | All Restores |
| | `/restores/:restoreId` | GET | Own Restore | All Restores | All Restores |
| | `/files/:fileId/versions/:versionId/restore` | POST | Own File | Allowed | Forbidden |
| **Reports** | `/reports/storage` | GET | Allowed | Allowed | Allowed |
| | `/reports/backups` | GET | Allowed | Allowed | Allowed |
| | `/reports/integrity` | GET | Allowed | Allowed | Allowed |
| **Audit** | `/audit` | GET | Forbidden | Allowed | Allowed |
| **User Mgmt** | `/users` | GET | Forbidden | Allowed | Forbidden |
| | `/users/:userId` | GET | Forbidden | Allowed | Forbidden |
| | `/users` | POST | Forbidden | Allowed | Forbidden |
| | `/users/:userId` | PATCH | Forbidden | Allowed | Forbidden |
| | `/users/:userId/status` | PATCH | Forbidden | Allowed | Forbidden |
| | `/users/:userId/reset-password` | POST | Forbidden | Allowed | Forbidden |

---

## 3. Team D BFF Endpoint Specifications

### Auth & Session
- `POST /api/v1/ui/session` -> `{ username, password }` => `{ token, user }`
- `GET /api/v1/ui/me` -> Headers: `Authorization: Bearer <token>` => `{ user_id, name, username, role, status }`
- `DELETE /api/v1/ui/session` -> Logout session
- `POST /api/v1/ui/session/change-password` -> `{ current_password, new_password }`

### Dashboard Aggregation
- `GET /api/v1/ui/dashboard` -> Aggregates Team A queue, Team B dedup info, and Team C storage/backups/restores safely with fallback flags (`available: false`).

### Files & Versions
- `GET /api/v1/ui/files` -> Filtered list of files based on role ownership.
- `POST /api/v1/ui/files/upload` -> Multipart file upload. Uploads bytes to shared storage, registers with Team C. Headers: `Idempotency-Key` (Optional). Roles: `Employee`, `IT Admin`.
- `GET /api/v1/ui/files/:fileId` -> Single file details.
- `GET /api/v1/ui/files/:fileId/download-url` -> Generates presigned shared storage URL for Team B / client downloads.
- `GET /api/v1/ui/files/:fileId/versions` -> List of version history records with checksums.

### Backups
- `GET /api/v1/ui/backups` -> List backup operations.
- `GET /api/v1/ui/backups/:backupId` -> Get backup details enriched with Team B deduplication and verification info.
- `POST /api/v1/ui/backups` -> Body: `{ file_id, file_name }`, Header: `Idempotency-Key` (Mandatory). Retries with same key return cached result without duplicating backups.

### Restores
- `GET /api/v1/ui/restores` -> List restore operations.
- `GET /api/v1/ui/restores/:restoreId` -> Get restore operation status.
- `POST /api/v1/ui/files/:fileId/versions/:versionId/restore` -> Trigger restore request with Team C as authoritative manager.

### User Management (IT Admin Only)
- `GET /api/v1/ui/users` -> List users (passwords excluded).
- `GET /api/v1/ui/users/:userId` -> Get user by ID.
- `POST /api/v1/ui/users` -> Body: `{ name, username, role, password }`.
- `PATCH /api/v1/ui/users/:userId/status` -> Body: `{ status: "ACTIVE" | "DISABLED" }`.
- `POST /api/v1/ui/users/:userId/reset-password` -> Body: `{ password }`.

---

## 4. Upstream Service Contracts (Real API Integration Specifications)

When other teams deploy their microservices and Team D switches environment modes (`TEAM_A_MODE=real`, `TEAM_B_MODE=real`, `TEAM_C_MODE=real`), Team A, B, and C must provide the following HTTP endpoints:

### Team A (Backup Job Scheduler)
- `GET {TEAM_A_BASE_URL}/api/v1/backup/jobs` -> List all backup/restore jobs
- `POST {TEAM_A_BASE_URL}/api/v1/backup/jobs` -> Submit backup or restore job
  - Required Headers: `Content-Type: application/json`, `Idempotency-Key: <value>`, `X-Correlation-ID: <value>`
  - Request Body: `{ job_id, backup_id, user_id, file_id, backup_type: "BACKUP"|"RESTORE", source_path, preferred_window: "ANY"|"DAY"|"NIGHT", priority, estimated_duration_ms }`
- `GET {TEAM_A_BASE_URL}/api/v1/backup/jobs/:jobId` -> Query job lifecycle status (`REQUESTED` -> `QUEUED` -> `CHUNKING` -> `DEDUPLICATING` -> `UPLOADING` -> `COMMITTED` -> `VERIFIED` -> `COMPLETED`)
- `POST {TEAM_A_BASE_URL}/api/v1/backup/jobs/:jobId/cancel` -> Cancel active job
- `GET {TEAM_A_BASE_URL}/api/v1/workers` -> List active worker nodes
- `GET {TEAM_A_BASE_URL}/api/v1/workers/:workerId/queue` -> Query specific worker queue
- `GET {TEAM_A_BASE_URL}/api/v1/metrics/backup` -> Scheduler performance KPIs
- `GET {TEAM_A_BASE_URL}/api/v1/stream/backup` -> Real-time SSE stream of job execution events

### Team B (Deduplication & Integrity Engine)
- `GET {TEAM_B_BASE_URL}/api/v1/chunks/index` -> Chunk index coverage and status
- `POST {TEAM_B_BASE_URL}/api/v1/dedup/compute` -> Compute deduplication result from file/chunk hashes
- `GET {TEAM_B_BASE_URL}/api/v1/dedup/:resultId` -> Fetch stored deduplication result by result ID
- `POST {TEAM_B_BASE_URL}/api/v1/integrity/verify` -> Verify chunk integrity vs Merkle root
- `GET {TEAM_B_BASE_URL}/api/v1/metrics/dedup` -> Deduplication index, benchmark, and timing metrics

### Team C (System of Record: Metadata, Version & Restore Manager)
#### Confirmed Endpoints:
- `GET {TEAM_C_BASE_URL}/api/v1/files?user_id=...&role=...` -> Filtered file index
- `POST {TEAM_C_BASE_URL}/api/v1/files` -> Register file metadata
- `GET {TEAM_C_BASE_URL}/api/v1/files/:fileId` -> Single file details
- `PATCH {TEAM_C_BASE_URL}/api/v1/files/:fileId` -> Update file metadata
- `DELETE {TEAM_C_BASE_URL}/api/v1/files/:fileId` -> Delete file record
- `GET {TEAM_C_BASE_URL}/api/v1/files/:fileId/versions` -> File versions history
- `GET {TEAM_C_BASE_URL}/api/v1/files/:fileId/retention` -> Retention policy details
- `GET {TEAM_C_BASE_URL}/api/v1/versions/:versionId/chunks` -> Version chunk mapping
- `POST {TEAM_C_BASE_URL}/api/v1/backups` -> Register backup metadata
- `GET {TEAM_C_BASE_URL}/api/v1/backups/:backupId` -> Get backup record by ID
- `POST {TEAM_C_BASE_URL}/api/v1/backups/:backupId/cancel` -> Cancel backup record
- `GET {TEAM_C_BASE_URL}/api/v1/reports/storage` -> Aggregate storage report
- `GET {TEAM_C_BASE_URL}/api/v1/audit` -> Audit trail log
- `GET {TEAM_C_BASE_URL}/api/v1/users` -> List system users
- `POST {TEAM_C_BASE_URL}/api/v1/users` -> Create system user
- `PATCH {TEAM_C_BASE_URL}/api/v1/users/:userId/status` -> Update user status
- `POST {TEAM_C_BASE_URL}/api/v1/users/:userId/reset-password` -> Reset user password

#### Pending / Unconfirmed Endpoints (Handled with Graceful Degraded Fallbacks):
- `GET {TEAM_C_BASE_URL}/api/v1/backups` -> List-all backups (returns `{ items: [], upstream_unavailable: true }` when unreleased)
- `GET {TEAM_C_BASE_URL}/api/v1/restores` -> List restore operations (returns `{ items: [], upstream_unavailable: true }` when unreleased)
- `GET {TEAM_C_BASE_URL}/api/v1/restores/:restoreId` -> Query single restore operation status
- `POST {TEAM_C_BASE_URL}/internal/v1/restores/commit` -> Commit restore operation

