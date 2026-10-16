# Team D ↔ Team C contract

## Authentication and permissions

Every route except `GET /`, `GET /openapi.json`, and Swagger UI requires `Authorization: Bearer <TEAM_D_SERVICE_SECRET>`, `X-TeamC-User-Id`, and `X-TeamC-Role`. `GET /api/v1/integration/users/{userId}` requires the bearer credential only. Team C reloads each user's active state and role from MySQL on every request. Team D must authenticate its own session, resolve an explicit account mapping, and set these headers server-side.

Employee access is owner-only for file, version, backup, and restore operations. IT Admin can manage and read files/backups across users, and read audit and storage reports; restore creation still requires ownership of the referenced backup. Auditor has cross-user read-only access to file/version metadata, backup and restore status/download, audit, and reports. Database ownership checks apply independently of role names.

Required environment variable names: `TEAM_D_SERVICE_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_REGION`, `MINIO_BUCKET`, `TEAM_A_BASE_URL`, `TEAM_B_BASE_URL`, and `TEAM_B_STORAGE_PROVIDER`. Team B authorization settings are optional and described below.

## Response conventions

JSON success: `{ data, meta: { correlation_id, api_version } }`. JSON error: `{ error: { code, message, details }, meta: { correlation_id } }`. `X-Correlation-ID` is optional. File download returns raw bytes.

## Route contract

| Method/path | Request | Response / roles |
| --- | --- | --- |
| `GET /api/v1/integration/users/{userId}` | numeric ID | `{user_id,role}`; service credential only |
| `POST /api/v1/auth/verify-credentials` | `{username,password}` | `{user_id,username,role,is_active}`; **service credential only** (no X-TeamC-* headers). 401 wrong credentials, 403 disabled, 429 after 5 failures/15 min per username |
| `POST /api/v1/users` | `{username,password,role,name?,email?}` | `201 {user_id,username,role,is_active}`; **IT Admin only**; password min 8 chars, bcrypt-hashed; 409 if username/email exists; audit row written |
| `GET /api/v1/users` | none | user list without hashes; IT Admin only |
| `PATCH /api/v1/users/{userId}` | `{is_active:boolean}` | enable/disable; IT Admin only; cannot disable yourself |
| `GET /api/v1/files` | none | file row array; Employee owned rows, Admin/Auditor all |
| `GET /api/v1/files/{fileId}` | numeric ID | file metadata/object key; owner or Admin/Auditor |
| `POST /api/v1/files` | multipart `file`, `file_name`, `user_id`; `Idempotency-Key` header | `{file_id,version_id,object_key,checksum}`; Employee own or Admin; identical replay returns existing IDs |
| `PATCH /api/v1/files/{fileId}` | optional `file_name,location_id,policy_id` | `{file_id}`; owner or Admin |
| `DELETE /api/v1/files/{fileId}` | numeric ID | `{file_id,deleted}`; owner or Admin |
| `GET /api/v1/files/{fileId}/versions` | numeric ID | version metadata array; owner or Admin/Auditor |
| `GET /api/v1/files/{fileId}/retention` | numeric ID | version retention array; owner or Admin/Auditor |
| `GET /api/v1/versions/{versionId}/chunks` | numeric ID | chunk metadata; version owner or Admin/Auditor |
| `POST /api/v1/backups` | `user_id,file_id,version_id,backup_type`; `Idempotency-Key` | `{backup_id,state,version_id,backup_type,idempotency_key,team_a}`; owner or Admin, request is asynchronous |
| `GET /api/v1/backups/{backupId}` | numeric ID | persistent backup state, Team B manifest status/result/source; owner or Admin/Auditor |
| `POST /api/v1/backups/{backupId}/team-b/compute` | numeric ID | retry failed/skipped Team B manifest creation for a completed backup; owner or Admin |
| `POST /api/v1/backups/{backupId}/cancel` | numeric ID | cancellation result; owner or Admin |
| `POST /api/v1/backups/{backupId}/complete` | numeric ID | `409 WORKER_OWNED_STATE`; manual success is disallowed |
| `POST /restore` | `backup_id,version_id`, optional matching `user_id` | `{restore_id,commit_status:PENDING}`; source backup owner or Admin acting as that owner |
| `GET /restore/{id}` | numeric ID | status and timestamps; owner or Admin/Auditor |
| `POST /internal/v1/restores/commit` | `restore_id` | verified `{restore_id,commit_status,download_path,file_name,size_bytes,checksum}`; owner or Admin for owned request |
| `GET /api/v1/restores/{restoreId}/download` | numeric ID | raw restored bytes; owner or Admin/Auditor |
| `POST /restore/{id}/complete` | numeric ID | compatibility route using the same verified execution; Auditor denied |
| `GET /api/v1/audit` | optional filters | up to 100 audit rows; Admin/Auditor |
| `GET /api/v1/reports/storage` | none | storage report; Admin/Auditor |
| `GET /files`, `GET /backup/{id}` | legacy routes | existing response envelopes, same owner/role enforcement |

`GET /api/v1/backups` and `GET /api/v1/restores` are supported collection endpoints with `limit`/`offset` pagination and optional filters. Backup history can also be read by ID with `GET /api/v1/backups/{backupId}`. Restore status remains `GET /restore/{id}`.

## Execution behavior

Upload writes bytes to MinIO and persists a file plus initial committed `file_versions` row in a DB transaction. Object upload is cleaned up when metadata persistence fails. Upload idempotency is unique per owner and replays do not create another object or DB row.

Backup creation persists `REQUESTED`, schedules through Team A `POST /api/v1/backup/jobs` using its documented `source_path` field, and acquires Team A's exclusive file lock. Team C then reads the selected committed version, checks SHA-256 and size against MySQL, writes a separate backup object, reads it back and verifies integrity, then persists `COMPLETED`; failures persist `FAILED`. Team A's scheduler job state is separate from Team C's verified content status. After completion, when `TEAM_B_BASE_URL` is configured, Team C makes one automatic storage-backed `POST /api/v1/dedup/compute` call. It sends `file_id`, the same persistent `backup_id`, and `version_id` as strings, plus the Team C verified backup object's storage `provider`, `bucket`, and `key`. The key format is `users/{user_id}/backups/{backup_id}/{version_id}`. Team B creates its own chunk objects and manifest before returning HTTP 200. Team C validates `status: COMPLETED`, matching backup ID and source, and the presence of `chunk_manifest`, `merkle_root`, and `dedup_result_id` before persisting `team_b_manifest_status: READY`.

Team D should use `GET /api/v1/backups/{backupId}` and wait for `data.team_b_manifest_status: READY`. The response also exposes `data.team_b_dedup_result_id`, `data.team_b_merkle_root`, `data.team_b_source_provider`, `data.team_b_source_bucket`, and `data.team_b_source_key`. `data.state: COMPLETED` means Team C verified its backup object; it does not mean Team B integrity verification passed. Once the manifest status is `READY`, Team D may call Team B `POST /api/v1/integrity/verify` with `{"backup_id":"<backup_id>"}` and must require both `verified: true` and `status: VERIFIED`.

Team B compute does not accept an idempotency key. Team C's automatic path makes one call per backup. Team C's conditional database claim prevents concurrent calls; an explicit Team C retry at `POST /api/v1/backups/{backupId}/team-b/compute` is available only after failure or skip, reuses the same backup/file/version identity, and may return a different Team B result ID. Team D should not call compute or use the retry route.

Set `TEAM_B_STORAGE_PROVIDER` to the provider configured in Team B (`backblaze-b2` in the current workspace). If Team B authorization is enabled, either set `TEAM_B_AUTHORIZATION` to the complete Authorization header value or configure `TEAM_B_API_TOKEN` with the exact `TEAM_B_AUTHORIZATION_SCHEME` used by the deployed Team B service (leave the scheme empty for a raw token). Team C deliberately does not assume a `Bearer` scheme. Apply `migrations/005_team_b_storage_manifests.sql` before deploying this integration (or rerun the idempotent `004_apply_all_idempotent.sql`).

Restore creation validates backup state, version ownership and retention. Commit reads exact version bytes, verifies checksum/size, writes a restore object, verifies it, persists completion and audit, and exposes a download path. Historical versions with `file_versions.object_key IS NULL` can fall back to the current file object only if its content matches the historical checksum and size; mismatches fail closed.

## Migrations and verification status

Apply `migrations/004_apply_all_idempotent.sql` before startup. It contains 001, 002, 003 plus the new `users.username` column, only adds what is missing, and is safe to run on the original dump, on smart_file_backup_system_v3.sql, or twice. Then run `npm run seed` once to give the sample users a real bcrypt password (demo password `Password@123`; change it before hosting). 001-003 are kept for history; do not run 001 on a database that already has `is_active`. Existing configured MySQL was reachable read-only and those migrations were applied without deleting data. Existing live row counts were preserved.

The automated `npm test` suite uses controlled DB and S3 mocks; it covers credentials, roles, ownership, upload rollback/idempotency, backup worker copy/verification, and restore byte integrity. These are not live service verification. The backend was not running on localhost:3000, MinIO check timed out, and configured Team A and Team B endpoints timed out. No live upload/backup/restore has been verified. Live E2E requires those endpoints to be reachable and MinIO permissions/bucket settings confirmed.


## Login flow for Team D (added)

1. Team D login page sends username/password to `POST /api/v1/auth/verify-credentials` (server-side, with the bearer secret).
2. Team C returns `{user_id, role}`. Team D creates its own session/JWT and stores `user_id`.
3. Every later call adds `X-TeamC-User-Id` and `X-TeamC-Role` from that session (never from browser input).
4. Admin creates users with `POST /api/v1/users`; the returned `user_id` is the one to store. No second user database is needed.

## Verification status (updated)

`npm test` (mocks) passes 8/8. `npm run test:live` (`test/live-e2e.js`) passes 40/40 against a real MySQL 8 with an S3-compatible stand-in for MinIO and a stand-in for Team A built from the Team A contract: login for all roles, user creation, role rules, upload (+idempotent replay), backup COMPLETED, restore, byte-for-byte and SHA-256 comparison. It has NOT been run against the real MinIO server or the real Team A / Team B services; run `npm run test:live` once those are reachable (set `BASE_URL` and `TEAM_D_SERVICE_SECRET`).
Behaviour changes found by the live test: uploads without `policy_id` now get the first retention policy by default (before, such files could never be restored); deleting a file that still has backup/restore history returns `409 FILE_HAS_BACKUPS` instead of a raw 500.
