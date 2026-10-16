# Engine 3 API Demo

## Team D service identity (required)

All application routes except `/`, `/openapi.json`, and Swagger UI require `Authorization: Bearer <TEAM_D_SERVICE_SECRET>`. Protected user-scoped requests also require `X-TeamC-User-Id: <numeric Team C users.user_id>` and `X-TeamC-Role: Employee|IT Admin|Auditor`. Team C looks up the ID and role on every request and rejects unknown users or role mismatches. Never forward browser-provided identity headers; Team D must authenticate its portal session, resolve that account through an explicit operator-provisioned account-to-Team-C-user mapping, and set these headers server-side. IDs need not match across systems; role similarity is not a mapping.

Standalone development startup uses the same protected API mode; there is no insecure identity bypass. Only the root health route and API documentation are public.

Configure a unique high-entropy `TEAM_D_SERVICE_SECRET` in Team C's backend environment and the identical value in Team D's backend secret store. Do not put it in browser code, source control, or logs. Until provisioned, protected routes fail closed. `GET /api/v1/integration/users/{userId}` requires the bearer credential (no user assertion) and returns only `user_id` and `role` for mapping verification. API documentation includes these headers; the service token belongs only in Team D's server configuration. Apply both numbered migrations in `migrations/` to a restored database before startup.

### Role permissions enforced by Team C

| Team C role | Permitted access |
| --- | --- |
| Employee | Read, upload, update, delete, back up, and request/execute restore only for records owned by the asserted Team C user. Cannot read audit or aggregate storage reports. |
| IT Admin | Read and manage files and backup requests across users; read audit and storage reports. Restore operations require the authenticated identity to own the source backup. |
| Auditor | Read-only access to files, versions, retention, chunks, backups, restored bytes, restore status, audit, and storage reports across users. All writes are denied. |

These permissions are Team C's explicit least-privilege policy because the supplied design material identifies roles but does not provide an operation-by-operation matrix. Confirm this policy with the project owner before production deployment. Ownership checks resolve the file, version, backup, or restore record against the Team C user table; asserted role names alone never grant access.

Every application route, including legacy routes and `/test-db`, requires the service bearer credential and a valid identity assertion, except root health, OpenAPI JSON, and Swagger UI. Browser-supplied identity headers must never be forwarded by Team D. Multipart upload requires `user_id`; it must be a positive numeric value equal to the authenticated identity. Team C always stores the authenticated user's ID.

## Start the services

1. Start MySQL and confirm the `smart_file_backup_system` database is loaded.
2. In PowerShell, open the `backend` folder and run `npm start` (or `node server.js`).
3. Confirm the console says `MySQL connected successfully!` and `Server running on http://localhost:3000`.

## Show the API

Open `http://localhost:3000/api-docs` and use **Try it out** on these read-only endpoints:

1. `GET /test-db` - database connectivity.
2. `GET /api/v1/files` - registered files.
3. `GET /api/v1/files/1/versions` - version records.
4. `GET /api/v1/versions/1/chunks` - chunk records associated with a version.
5. `GET /api/v1/reports/storage` - storage usage report.
6. `GET /api/v1/backups/1` - an existing backup record.
7. `GET /api/v1/backups/999999` - expected not-found response (404).

## Show repeatable test evidence

Run `npm test` from the backend directory for the automated controlled-mock security suite. Run `./smoke-test.ps1` (or `& .\smoke-test.ps1`) only after providing the service and identity headers expected by Team C. The mock suite does not connect to MySQL or MinIO and does not change stored data.

To run the same checks in Postman Web, import `demo-tests.postman_collection.json`, set `baseUrl` to the reachable backend URL, and run the collection. For another laptop, do not use `localhost`; use a LAN or tunnel URL and ensure the API server and firewall allow access.

## Explain the architecture accurately

The Express backend uploads file bytes to the configured MinIO bucket and stores the object key in `files.source_path` and `file_versions.object_key`. Upload uses multipart `user_id`, `file_name`, and binary `file`, plus an `Idempotency-Key` header; `location_id` and `policy_id` are optional. Uploads are limited to 100 MiB. The API returns file and version IDs, object key, and SHA-256 without exposing MinIO credentials.

Backup creation records a request and audit entry, schedules the job and obtains Team A's file lock. The Team C worker reads the selected committed version from MinIO, verifies its SHA-256 and size against MySQL, writes a separate backup object, reads it back, verifies it, then sets the persistent state to `COMPLETED`; any failure is persisted as `FAILED`. After completion, Team C sends Team B the stable backup ID and verified backup object reference using Team B's storage-backed compute contract. Team B reads that object and writes its own chunk objects and manifest. Team C tracks manifest readiness separately from backup state; Team B failures do not change Team C's completed backup. Configure `TEAM_B_STORAGE_PROVIDER` and, when Team B authentication is enabled, the exact authorization settings documented in `TEAM_D_INTEGRATION.md`.

Example successful upload response:

```json
{
  "data": {
    "file_id": 123,
    "object_key": "users/1/files/6bff2554-e6be-4926-af95-f713ecaf5553/report.docx"
  },
  "meta": {
    "correlation_id": "corr-123",
    "api_version": "v1"
  }
}
```

Restore commit retrieves the selected version object, verifies the committed version checksum and size, writes a restore object, verifies the write, persists status and audit, then returns `download_path`. `GET /api/v1/restores/{restoreId}/download` returns the restored bytes. Historical versions without a version object key can be restored only when the legacy file object still matches that version's recorded checksum and size.

The automated suite uses controlled MySQL and S3 mocks. It proves code paths and response behavior, not live integration. Live service verification has not passed in this environment; see `TEAM_D_INTEGRATION.md` for the latest service reachability findings and blockers.

## Slide corrections

- The SQL export contains 11 tables and 2 views.
- File registration is `POST /api/v1/files`.
- The core backup request route is `POST /api/v1/backups`.
- Swagger documents the core demo endpoints; the full route implementation remains in `server.js`.
