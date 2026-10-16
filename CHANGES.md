# Changes made on top of the team's backend

## Added (Team D requirements)
- `POST /api/v1/auth/verify-credentials` (login), `POST /api/v1/users` (create user), `GET /api/v1/users`, `PATCH /api/v1/users/{id}` (enable/disable). bcrypt passwords, login throttling, audit rows, documented in `openapi.json`.
- `users.username` column (migration `004_apply_all_idempotent.sql`, safe on original dump and on v3).
- `scripts/seed_passwords.js` (real bcrypt hash for the sample users), `test/live-e2e.js` (40 live checks).

## Fixed
- `package.json` was missing `swagger-ui-express` (it only worked because it was installed in the parent folder) -> added, plus `bcryptjs`.
- Files uploaded without `policy_id` could never be restored -> default retention policy applied on upload.
- Deleting a file with backup history returned a raw 500 -> clean `409 FILE_HAS_BACKUPS`.
- Migration 001 failed on v3 (`Duplicate column is_active`) -> idempotent 004.
- Team B now receives storage-backed dedup compute only after Team C verifies and persists the backup object. Team C passes the stable `backup_id` and object reference, persists manifest readiness independently from backup state, and exposes a guarded retry route. Migration 005 adds the Team B result/status fields.
- Team B compute receives `version_id` as a string. Team B has no idempotency-key contract; Team C retries reuse the same backup/file/version identity, though a retry may produce a different dedup result ID.

## Not changed (recommendations, see report)
- Single shared MySQL connection (`createConnection`) with transactions on it: concurrent requests can interleave inside one transaction. Move to a pool with per-transaction connections before hosting.
- Team A job ids are `backup-<backup_id>`: if the Team C database is reset while Team A keeps its jobs, ids repeat and Team A answers 409 DUPLICATE_JOB.
- Team B manifest creation is asynchronous and best-effort; Team C completion remains independent from Team B integrity verification. Team D must wait for `team_b_manifest_status: READY` before calling Team B's integrity verify endpoint.
- `server_backup_working.js` / `server_before_transactions.js` / `USE smart_file_backup_system;.sql` are old copies and can be deleted.
