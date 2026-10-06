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
- `GET {TEAM_A_BASE_URL}/api/v1/queue`
  - Expected Response: `[ { "job_id": "string", "file_name": "string", "state": "RUNNING|QUEUED", "progress": number } ]`
- `GET {TEAM_A_BASE_URL}/api/v1/metrics`
  - Expected Response: `{ "active_jobs": number, "avg_wait_time_ms": number, "throughput_per_min": number }`

### Team B (Deduplication & Integrity Engine)
- `GET {TEAM_B_BASE_URL}/api/v1/backups/:backupId/dedup`
  - Expected Response: `{ "dedup_result_id": "string", "unique_chunks": number, "duplicate_chunks": number, "savings_ratio": number }`
- `GET {TEAM_B_BASE_URL}/api/v1/backups/:backupId/verification`
  - Expected Response: `{ "merkle_root": "string", "verified_chunks": number, "corrupted_chunks": number, "status": "VERIFIED|CORRUPTED" }`

### Team C (System of Record: Metadata, Version & Restore Manager)
- `GET {TEAM_C_BASE_URL}/api/v1/files?user_id=...&role=...`
- `POST {TEAM_C_BASE_URL}/api/v1/files`
  - Body: `{ file_id, name, type, size_bytes, size_kb, content_type, owner_id, storage_provider, storage_bucket, storage_key, checksum, uploaded_at }`
- `GET {TEAM_C_BASE_URL}/api/v1/files/:fileId`
- `GET {TEAM_C_BASE_URL}/api/v1/files/:fileId/versions`
- `GET {TEAM_C_BASE_URL}/api/v1/backups?user_id=...&role=...`
- `GET {TEAM_C_BASE_URL}/api/v1/backups/:backupId`
- `POST {TEAM_C_BASE_URL}/api/v1/backups` -> Body: `{ file_id, file_name, user_id }`
- `GET {TEAM_C_BASE_URL}/api/v1/restores?user_id=...&role=...`
- `GET {TEAM_C_BASE_URL}/api/v1/restores/:restoreId`
- `POST {TEAM_C_BASE_URL}/api/v1/restores` -> Body: `{ file_id, version_id, user_id }`
- `GET {TEAM_C_BASE_URL}/api/v1/reports/storage`
- `GET {TEAM_C_BASE_URL}/api/v1/audit`
- `GET {TEAM_C_BASE_URL}/api/v1/users`
- `POST {TEAM_C_BASE_URL}/api/v1/users`
- `PATCH {TEAM_C_BASE_URL}/api/v1/users/:userId/status`
- `POST {TEAM_C_BASE_URL}/api/v1/users/:userId/reset-password`

