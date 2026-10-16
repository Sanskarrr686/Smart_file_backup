const express = require("express");
const mysql = require("mysql2");
const swaggerUi = require("swagger-ui-express");
const multer = require("multer");
const { randomUUID, timingSafeEqual, createHash } = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const {
    S3Client, 
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const openApiSpec = require("./openapi.json");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const TEAM_A_BASE_URL = process.env.TEAM_A_BASE_URL || "http://localhost:8081";
const TEAM_B_BASE_URL = process.env.TEAM_B_BASE_URL;
// Team B deployments may use different credential formats, so Team C never infers a scheme.
const TEAM_B_AUTHORIZATION = process.env.TEAM_B_AUTHORIZATION || "";
const TEAM_B_API_TOKEN = process.env.TEAM_B_API_TOKEN || "";
const TEAM_B_AUTHORIZATION_SCHEME = process.env.TEAM_B_AUTHORIZATION_SCHEME;
const MINIO_BUCKET = process.env.MINIO_BUCKET || "smart-file-backups";
const TEAM_B_STORAGE_PROVIDER = process.env.TEAM_B_STORAGE_PROVIDER || (() => {
    try {
        return new URL(process.env.MINIO_ENDPOINT).hostname.includes("backblazeb2.com") ? "backblaze-b2" : "minio";
    } catch {
        return "";
    }
})();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const s3Client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: process.env.MINIO_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY,
        secretAccessKey: process.env.MINIO_SECRET_KEY
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED"
});
const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES }
});
const teamALeaseIds = new Map();

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get("/openapi.json", (req, res) => {
    return res.json(openApiSpec);
});

// =====================================================
// API VERSION + CORRELATION ID
// =====================================================

app.use((req, res, next) => {
    const correlationId =
        req.header("X-Correlation-ID") ||
        req.body?.correlation_id ||
        `corr-${Date.now()}`;

    req.correlationId = correlationId;

    res.setHeader("X-Correlation-ID", correlationId);

    next();
});

// Team D is the only caller allowed to assert a Team C identity. The identity
// is always reloaded from Team C's database; browser-supplied IDs/roles alone
// are never credentials. Configure the same high-entropy secret in both apps.
const TEAM_D_SERVICE_SECRET = process.env.TEAM_D_SERVICE_SECRET || "";
const PUBLIC_PATHS = new Set(["/", "/openapi.json"]);
app.use((req, res, next) => {
    if (PUBLIC_PATHS.has(req.path) || req.path === "/api-docs" || req.path.startsWith("/api-docs/")) return next();
    const authorization = req.get("Authorization") || "";
    const match = authorization.match(/^Bearer ([^\s]+)$/i);
    const supplied = match?.[1] || "";
    const expected = TEAM_D_SERVICE_SECRET;
    const suppliedBytes = Buffer.from(supplied, "utf8");
    const expectedBytes = Buffer.from(expected, "utf8");
    const authorized = expectedBytes.length > 0 && suppliedBytes.length === expectedBytes.length &&
        timingSafeEqual(suppliedBytes, expectedBytes);
    if (!authorized) return errorResponse(res, 401, "UNAUTHORIZED", "A valid Team D service credential is required", req.correlationId);
    if (/^\/api\/v1\/integration\/users\/\d+$/.test(req.path) && req.method === "GET") {
        req.integrationService = true;
        return next();
    }
    // Login is called by Team D BEFORE any Team C identity exists, so only the service credential is required.
    if (req.path === "/api/v1/auth/verify-credentials" && req.method === "POST") {
        req.integrationService = true;
        return next();
    }
    const userIdHeader = req.get("X-TeamC-User-Id") || "";
    const userId = Number(userIdHeader);
    const assertedRole = req.get("X-TeamC-Role");
    if (!/^[1-9][0-9]*$/.test(userIdHeader) || !Number.isSafeInteger(userId) || !assertedRole) return errorResponse(res, 401, "IDENTITY_REQUIRED", "Team D must assert a mapped Team C user ID and role", req.correlationId);
    db.query("SELECT u.user_id, u.is_active, r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?", [userId], (err, rows) => {
        if (err) return errorResponse(res, 503, "IDENTITY_UNAVAILABLE", "Could not validate Team C identity", req.correlationId);
        if (!rows.length) return errorResponse(res, 401, "UNKNOWN_USER", "Mapped Team C user does not exist", req.correlationId);
        if (Number(rows[0].is_active) !== 1) return errorResponse(res, 403, "USER_DISABLED", "Team C user is disabled", req.correlationId);
        if (rows[0].role_name !== assertedRole) return errorResponse(res, 403, "ROLE_MISMATCH", "Asserted role does not match Team C role", req.correlationId);
        if (!["Employee", "IT Admin", "Auditor"].includes(rows[0].role_name)) return errorResponse(res, 403, "ROLE_NOT_AUTHORIZED", "Team C role is not enabled for API access", req.correlationId);
        req.identity = { userId: rows[0].user_id, role: rows[0].role_name };
        authorizeRoute(req, res, next);
    });
});

function authorizeRoute(req, res, next) {
    const { role, userId } = req.identity;
    const method = req.method.toUpperCase();
    const pathName = req.path;
    const isRead = method === "GET" || method === "HEAD";
    if (role === "Auditor" && (!isRead || !(pathName === "/api/v1/files" || /^\/api\/v1\/files\/\d+(\/versions|\/retention)?$/.test(pathName) || /^\/api\/v1\/versions\/\d+\/chunks$/.test(pathName) || /^\/api\/v1\/backups\/\d+$/.test(pathName) || /^\/api\/v1\/restores\/\d+\/download$/.test(pathName) || pathName === "/api/v1/backups" || pathName === "/api/v1/restores" || pathName === "/api/v1/audit" || pathName === "/api/v1/reports/storage" || /^\/restore\/\d+$/.test(pathName)))) return errorResponse(res, 403, "FORBIDDEN", "Auditor access is read-only and limited to approved reporting and file data", req.correlationId);
    if (role === "Employee" && (pathName === "/api/v1/audit" || pathName === "/api/v1/reports/storage" || pathName === "/test-db")) return errorResponse(res, 403, "FORBIDDEN", "This operation is not permitted for Employee", req.correlationId);
    if (role !== "Employee") return next();

    let sql;
    let params;
    const fileId = pathName.match(/^\/api\/v1\/files\/(\d+)/)?.[1];
    const versionId = pathName.match(/^\/api\/v1\/versions\/(\d+)\/chunks$/)?.[1];
    const backupId = pathName.match(/^\/api\/v1\/backups\/(\d+)/)?.[1] || pathName.match(/^\/backup\/(\d+)$/)?.[1];
    const restoreId = pathName.match(/^\/restore\/(\d+)/)?.[1] || (pathName === "/internal/v1/restores/commit" ? req.body?.restore_id : null);
    const downloadRestoreId = pathName.match(/^\/api\/v1\/restores\/(\d+)\/download$/)?.[1];
    if (fileId) { sql = "SELECT user_id FROM files WHERE file_id = ?"; params = [fileId]; }
    else if (versionId) { sql = "SELECT f.user_id FROM file_versions v JOIN files f ON f.file_id = v.file_id WHERE v.version_id = ?"; params = [versionId]; }
    else if (backupId) { sql = "SELECT user_id FROM backup_jobs WHERE backup_id = ?"; params = [backupId]; }
    else if (restoreId && (pathName.startsWith("/restore/") || pathName === "/internal/v1/restores/commit")) { sql = "SELECT user_id FROM restore_requests WHERE restore_id = ?"; params = [restoreId]; }
    else if (downloadRestoreId) { sql = "SELECT user_id FROM restore_requests WHERE restore_id = ?"; params = [downloadRestoreId]; }
    else if (method === "POST" && pathName === "/api/v1/backups") { sql = "SELECT user_id FROM files WHERE file_id = ?"; params = [req.body?.file_id]; }
    else if (method === "POST" && pathName === "/restore") { sql = "SELECT user_id FROM backup_jobs WHERE backup_id = ?"; params = [req.body?.backup_id]; }
    else if (pathName === "/api/v1/files" && method === "GET") return next();
    else if (pathName === "/api/v1/files" && method === "POST") return next();
    else return next();
    if (!params[0]) return errorResponse(res, 400, "INVALID_RESOURCE_ID", "A valid resource ID is required", req.correlationId);
    db.query(sql, params, (err, rows) => {
        if (err) return errorResponse(res, 503, "AUTHORIZATION_UNAVAILABLE", "Could not verify resource ownership", req.correlationId);
        if (!rows.length) return errorResponse(res, 404, "RESOURCE_NOT_FOUND", "Resource not found", req.correlationId);
        if (Number(rows[0].user_id) !== Number(userId)) return errorResponse(res, 403, "FORBIDDEN", "Employees may access only their own resources", req.correlationId);
        if (req.body?.user_id !== undefined && Number(req.body.user_id) !== Number(userId)) return errorResponse(res, 403, "IDENTITY_MISMATCH", "Submitted user_id does not match authenticated identity", req.correlationId);
        next();
    });
}

// =====================================================
// STANDARD RESPONSE HELPERS
// =====================================================

function successResponse(res, statusCode, data, correlationId) {
    return res.status(statusCode).json({
        data: data,
        meta: {
            correlation_id: correlationId,
            api_version: "v1"
        }
    });
}

function errorResponse(
    res,
    statusCode,
    code,
    message,
    correlationId,
    details = []
) {
    return res.status(statusCode).json({
        error: {
            code: code,
            message: message,
            details: details
        },
        meta: {
            correlation_id: correlationId
        }
    });
}

// =====================================================
// MYSQL CONNECTION
// =====================================================

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

function queryAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => err ? reject(err) : resolve(results));
    });
}

function transactionAsync(work) {
    return new Promise((resolve, reject) => {
        db.beginTransaction(async (beginErr) => {
            if (beginErr) return reject(beginErr);
            try {
                const value = await work();
                db.commit((commitErr) => {
                    if (commitErr) return db.rollback(() => reject(commitErr));
                    resolve(value);
                });
            } catch (err) {
                db.rollback(() => reject(err));
            }
        });
    });
}

async function objectToBuffer(body) {
    if (!body) throw new Error("Object storage returned an empty body");
    if (typeof body.transformToByteArray === "function") return Buffer.from(await body.transformToByteArray());
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function callTeamA(path, method, body, correlationId, idempotencyKey) {
    const headers = {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId
    };

    if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
    }

    let response;

    try {
        response = await fetch(`${TEAM_A_BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(5000)
        });
    } catch (error) {
        throw new Error(
            `Team A ${method} ${path} request failed: ${
                error.cause?.message || error.message
            }`
        );
    }

    const payload = await response.json();

    if (!response.ok) {
        throw new Error(
            `Team A ${method} ${path} failed (${response.status}): ${
                payload.error?.message || "unknown error"
            }`
        );
    }

    return payload;
}

function getChunkRecordsForVersion(versionId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT c.chunk_hash, c.chunk_size
            FROM version_chunks vc
            INNER JOIN chunks c
                ON vc.chunk_id = c.chunk_id
            WHERE vc.version_id = ?
            ORDER BY vc.sequence_no
        `;

        db.query(sql, [versionId], (err, results) => {
            if (err) {
                return reject(err);
            }

            if (results.length === 0) {
                return reject(new Error(`No chunks found for version ${versionId}`));
            }

            resolve(results);
        });
    });
}

function canonicalStorageProvider(provider) {
    const normalized = String(provider || "").toLowerCase();
    if (["backblaze-b2", "backblaze_b2", "b2", "s3"].includes(normalized)) return "backblaze-b2";
    if (normalized === "minio") return "minio";
    return "";
}

async function callTeamBStorageCompute({ backupId, fileId, versionId, objectKey, correlationId }) {
    if (!TEAM_B_BASE_URL) throw new Error("TEAM_B_BASE_URL is not configured");
    const provider = canonicalStorageProvider(TEAM_B_STORAGE_PROVIDER);
    if (!provider) throw new Error("TEAM_B_STORAGE_PROVIDER could not be determined; configure it explicitly");

    const headers = {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId
    };
    if (TEAM_B_AUTHORIZATION) {
        headers.Authorization = TEAM_B_AUTHORIZATION;
    } else if (TEAM_B_API_TOKEN) {
        if (TEAM_B_AUTHORIZATION_SCHEME === undefined) throw new Error("TEAM_B_API_TOKEN is set but TEAM_B_AUTHORIZATION_SCHEME is not configured");
        headers.Authorization = TEAM_B_AUTHORIZATION_SCHEME
            ? `${TEAM_B_AUTHORIZATION_SCHEME} ${TEAM_B_API_TOKEN}`
            : TEAM_B_API_TOKEN;
    }

    let response;
    try {
        response = await fetch(`${TEAM_B_BASE_URL}/api/v1/dedup/compute`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                file_id: String(fileId),
                backup_id: String(backupId),
                version_id: String(versionId),
                storage: { provider, bucket: MINIO_BUCKET, key: objectKey },
                hash_algorithm: "sha256",
                chunk_size: DEDUP_CHUNK_SIZE
            }),
            signal: AbortSignal.timeout(30000)
        });
    } catch (error) {
        throw new Error(`Team B storage compute request failed: ${error.cause?.message || error.message}`);
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error(`Team B storage compute returned invalid JSON (HTTP ${response.status})`);
    }
    if (!response.ok) {
        const code = payload.error?.code || "TEAM_B_COMPUTE_FAILED";
        throw new Error(`${code} (HTTP ${response.status})`);
    }

    const data = payload.data || {};
    const returnedBackupId = payload.backup_id ?? data.backup_id;
    const status = payload.status ?? data.status;
    const source = payload.source ?? data.source;
    const dedupResultId = payload.dedup_result_id ?? data.dedup_result_id;
    const merkleRoot = payload.merkle_root ?? data.merkle_root;
    const chunkManifest = payload.chunk_manifest ?? data.chunk_manifest;
    if (String(returnedBackupId ?? "") !== String(backupId)) throw new Error("Team B response backup_id did not match the request");
    if (status !== "COMPLETED") throw new Error(`Team B compute status was ${String(status || "missing")}`);
    if (!dedupResultId || !merkleRoot || !Array.isArray(chunkManifest) || chunkManifest.length === 0) {
        throw new Error("Team B response did not include a complete manifest result");
    }
    if (!source || canonicalStorageProvider(source.provider) !== provider || source.bucket !== MINIO_BUCKET || source.key !== objectKey) {
        throw new Error("Team B response source did not match the requested storage object");
    }
    return {
        dedupResultId,
        merkleRoot,
        source
    };
}

async function scheduleBackupWithTeamA({
    backupId,
    userId,
    fileId,
    backupType,
    objectKey,
    correlationId,
    idempotencyKey
}) {
    const jobId = `backup-${backupId}`;

    await callTeamA(
        "/api/v1/backup/jobs",
        "POST",
        {
            job_id: jobId,
            backup_id: String(backupId),
            user_id: String(userId),
            file_id: String(fileId),
            backup_type: backupType === "RESTORE" ? "RESTORE" : "BACKUP",
            source_path: objectKey,
            priority: 2,
            estimated_duration_ms: 10000,
            preferred_window: "ANY"
        },
        correlationId,
        idempotencyKey
    );

    const lockResponse = await callTeamA(
        "/internal/v1/locks/acquire",
        "POST",
        {
            file_id: String(fileId),
            holder_id: jobId,
            lock_mode: "EXCLUSIVE",
            lease_timeout_ms: 30000
        },
        correlationId
    );

    teamALeaseIds.set(backupId, lockResponse.data.leaseId);
    return { job_id: jobId, lease_id: lockResponse.data.leaseId };
}

async function releaseBackupLockWithTeamA(backupId, correlationId) {
    const leaseId = teamALeaseIds.get(backupId);

    if (!leaseId) {
        return;
    }

    try {
        await callTeamA(
            `/internal/v1/locks/${encodeURIComponent(leaseId)}`,
            "DELETE",
            undefined,
            correlationId
        );
    } finally {
        teamALeaseIds.delete(backupId);
    }
}

const DEDUP_CHUNK_SIZE = 4096;

function splitIntoChunks(bytes) {
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += DEDUP_CHUNK_SIZE) {
        const piece = bytes.subarray(offset, Math.min(offset + DEDUP_CHUNK_SIZE, bytes.length));
        chunks.push({ hash: createHash("sha256").update(piece).digest("hex"), size: piece.length, offset });
    }
    return chunks;
}

async function saveChunkRecords(versionId, chunks) {
    const unique = new Map();
    for (const chunk of chunks) {
        if (!unique.has(chunk.hash)) unique.set(chunk.hash, chunk);
    }
    const uniqueChunks = [...unique.values()];
    const idByHash = new Map();
    for (let i = 0; i < uniqueChunks.length; i += 500) {
        const batch = uniqueChunks.slice(i, i + 500);
        await queryAsync(
            "INSERT INTO chunks (chunk_hash, chunk_size, storage_ref) VALUES ? ON DUPLICATE KEY UPDATE chunk_id = chunk_id",
            [batch.map((chunk) => [chunk.hash, chunk.size, `v${versionId}:${chunk.offset}+${chunk.size}`])]
        );
        const rows = await queryAsync("SELECT chunk_id, chunk_hash FROM chunks WHERE chunk_hash IN (?)", [batch.map((chunk) => chunk.hash)]);
        for (const row of rows) idByHash.set(row.chunk_hash, row.chunk_id);
    }
    await transactionAsync(async () => {
        await queryAsync("DELETE FROM version_chunks WHERE version_id = ?", [versionId]);
        for (let i = 0; i < chunks.length; i += 500) {
            const batch = chunks.slice(i, i + 500);
            await queryAsync(
                "INSERT INTO version_chunks (version_id, chunk_id, sequence_no) VALUES ?",
                [batch.map((chunk, j) => [versionId, idByHash.get(chunk.hash), i + j + 1])]
            );
        }
    });
}

async function createTeamBManifest({ backupId, fileId, versionId, objectKey, correlationId }) {
    if (!TEAM_B_BASE_URL) {
        await queryAsync(
            "UPDATE backup_jobs SET team_b_manifest_status='SKIPPED', team_b_manifest_error='TEAM_B_BASE_URL_NOT_CONFIGURED' WHERE backup_id=? AND state='COMPLETED' AND team_b_manifest_status IN ('NOT_REQUESTED','FAILED','SKIPPED')",
            [backupId]
        );
        return { status: "SKIPPED" };
    }

    // The stable backup ID is Team B's manifest identity. Only one Team C worker
    // can claim a request; explicit retries can reclaim FAILED/SKIPPED states.
    const claimed = await queryAsync(
        "UPDATE backup_jobs SET team_b_manifest_status='PENDING', team_b_manifest_started_at=CURRENT_TIMESTAMP, team_b_manifest_error=NULL WHERE backup_id=? AND state='COMPLETED' AND (team_b_manifest_status IN ('NOT_REQUESTED','FAILED','SKIPPED') OR (team_b_manifest_status='PENDING' AND (team_b_manifest_started_at IS NULL OR team_b_manifest_started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 MINUTE))))",
        [backupId]
    );
    if (!claimed.affectedRows) {
        const rows = await queryAsync("SELECT team_b_manifest_status FROM backup_jobs WHERE backup_id=?", [backupId]);
        const status = rows[0]?.team_b_manifest_status || "UNKNOWN";
        if (status === "READY" || status === "PENDING") return { status };
        throw new Error(`Team B manifest request could not be claimed (${status})`);
    }

    try {
        const result = await callTeamBStorageCompute({ backupId, fileId, versionId, objectKey, correlationId });
        await queryAsync(
            `UPDATE backup_jobs
             SET team_b_manifest_status='READY', team_b_dedup_result_id=?, team_b_merkle_root=?,
                 team_b_source_provider=?, team_b_source_bucket=?, team_b_source_key=?, team_b_manifest_error=NULL
             WHERE backup_id=? AND team_b_manifest_status='PENDING'`,
            [result.dedupResultId, result.merkleRoot, result.source.provider, result.source.bucket, result.source.key, backupId]
        );
        return { status: "READY", ...result };
    } catch (error) {
        const safeMessage = String(error.message || "TEAM_B_COMPUTE_FAILED").slice(0, 1000);
        await queryAsync(
            "UPDATE backup_jobs SET team_b_manifest_status='FAILED', team_b_manifest_error=? WHERE backup_id=? AND team_b_manifest_status='PENDING'",
            [safeMessage, backupId]
        ).catch(() => {});
        console.error(`Team B manifest compute failed for backup ${backupId}:`, safeMessage);
        return { status: "FAILED", error: safeMessage };
    }
}

async function runBackupWorker(backupId, userId, fileId, versionId, correlationId, idempotencyKey) {
    let objectKey;
    try {
        const rows = await queryAsync(
            `SELECT fv.object_key, f.source_path, fv.checksum, fv.size_bytes
             FROM file_versions fv JOIN files f ON f.file_id=fv.file_id
             WHERE fv.version_id=? AND fv.file_id=? AND f.user_id=? AND fv.state='COMMITTED'`,
            [versionId, fileId, userId]
        );
        if (!rows.length) throw Object.assign(new Error("Committed version metadata is unavailable"), { code: "VERSION_NOT_FOUND" });
        const sourceKey = rows[0].object_key || rows[0].source_path;
        const source = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: sourceKey }));
        const bytes = await objectToBuffer(source.Body);
        const checksum = createHash("sha256").update(bytes).digest("hex");
        if (checksum !== String(rows[0].checksum).toLowerCase() || bytes.length !== Number(rows[0].size_bytes)) {
            throw Object.assign(new Error("Source version integrity check failed"), { code: "INTEGRITY_CHECK_FAILED" });
        }
        await queryAsync("UPDATE backup_jobs SET state='RUNNING' WHERE backup_id=? AND state='REQUESTED'", [backupId]);
        objectKey = `users/${userId}/backups/${backupId}/${versionId}`;
        await s3Client.send(new PutObjectCommand({ Bucket: MINIO_BUCKET, Key: objectKey, Body: bytes, ContentLength: bytes.length, ContentType: "application/octet-stream", Metadata: { sha256: checksum, sourceVersion: String(versionId) } }));
        const check = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: objectKey }));
        const copiedBytes = await objectToBuffer(check.Body);
        if (copiedBytes.length !== bytes.length || createHash("sha256").update(copiedBytes).digest("hex") !== checksum) throw Object.assign(new Error("Backup object failed verification"), { code: "BACKUP_VERIFY_FAILED" });
        await transactionAsync(async () => {
            await queryAsync("UPDATE backup_jobs SET state='COMPLETED', backup_object_key=?, failure_reason=NULL, committed_at=CURRENT_TIMESTAMP WHERE backup_id=? AND state='RUNNING'", [objectKey, backupId]);
            await queryAsync("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'BACKUP_COMPLETED', 'BACKUP_JOBS', ?, ?)", [userId, backupId, correlationId]);
        });
        // Team B reads the verified backup object and creates its own chunk objects
        // and manifest. This runs after the API has accepted the backup and does
        // not change Team C's independent content-verification state.
        setImmediate(() => {
            Promise.allSettled([
                saveChunkRecords(versionId, splitIntoChunks(bytes)),
                createTeamBManifest({ backupId, fileId, versionId, objectKey, correlationId })
            ]).then((results) => {
                if (results[0].status === "rejected") console.error("Local chunk metadata save failed:", results[0].reason?.message || "unknown error");
            });
        });
    } catch (err) {
        if (objectKey) await s3Client.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: objectKey })).catch(() => {});
        const code = err.code || "BACKUP_EXECUTION_FAILED";
        await queryAsync("UPDATE backup_jobs SET state='FAILED', failure_reason=? WHERE backup_id=? AND state IN ('REQUESTED','RUNNING')", [code, backupId]).catch(() => {});
        await queryAsync("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'BACKUP_FAILED', 'BACKUP_JOBS', ?, ?)", [userId, backupId, correlationId]).catch(() => {});
        console.error("Backup execution failed:", code);
    } finally {
        await releaseBackupLockWithTeamA(backupId, correlationId).catch((err) => console.error("Team A lock release failed:", err.message));
    }
}

db.connect((err) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
        return;
    }

    console.log("MySQL connected successfully!");
});

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
    return successResponse(
        res,
        200,
        {
            message: "Smart File Backup System Backend is running!"
        },
        req.correlationId
    );
});

// =====================================================
// TEST DATABASE
// =====================================================

app.get("/test-db", (req, res) => {

    db.query("SELECT 1 AS result", (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Database query failed",
                req.correlationId,
                [err.message]
            );
        }

        return successResponse(
            res,
            200,
            results,
            req.correlationId
        );
    });
});

// =====================================================
// GET ALL FILES
// Official: GET /api/v1/files
// =====================================================

// =====================================================
// LOGIN + USER MANAGEMENT (requested by Team D)
// POST /api/v1/auth/verify-credentials  -> service credential only
// POST /api/v1/users                     -> IT Admin only, creates a Team C user
// GET  /api/v1/users                     -> IT Admin only
// PATCH /api/v1/users/:userId            -> IT Admin only, enable/disable
// =====================================================

const VALID_ROLES = ["Employee", "IT Admin", "Auditor"];
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,50}$/;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10); // equalises timing for unknown users
const loginFailures = new Map(); // key -> { count, firstAt }
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginThrottled(key) {
    const entry = loginFailures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) { loginFailures.delete(key); return false; }
    return entry.count >= LOGIN_MAX_FAILURES;
}
function recordLoginFailure(key) {
    const entry = loginFailures.get(key);
    if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) loginFailures.set(key, { count: 1, firstAt: Date.now() });
    else entry.count += 1;
}

app.post("/api/v1/auth/verify-credentials", async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password || username.length > 150 || password.length > 200) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "username and password are required", req.correlationId);
    }
    const throttleKey = username.toLowerCase();
    if (loginThrottled(throttleKey)) return errorResponse(res, 429, "TOO_MANY_ATTEMPTS", "Too many failed logins; try again later", req.correlationId);
    try {
        const rows = await queryAsync(
            "SELECT u.user_id, u.username, u.password_hash, u.is_active, r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.username = ? OR u.email = ? LIMIT 1",
            [username, username]
        );
        const user = rows[0];
        const hash = user && String(user.password_hash).startsWith("$2") ? user.password_hash : DUMMY_HASH;
        const passwordOk = await bcrypt.compare(password, hash);
        // identical response for unknown user / wrong password / unhashed legacy password (no user enumeration)
        if (!user || !passwordOk || hash === DUMMY_HASH) {
            recordLoginFailure(throttleKey);
            return errorResponse(res, 401, "INVALID_CREDENTIALS", "Invalid username or password", req.correlationId);
        }
        if (Number(user.is_active) !== 1) return errorResponse(res, 403, "USER_DISABLED", "Team C user is disabled", req.correlationId);
        loginFailures.delete(throttleKey);
        return successResponse(res, 200, { user_id: user.user_id, username: user.username, role: user.role_name, is_active: true }, req.correlationId);
    } catch (err) {
        return errorResponse(res, 500, "DATABASE_ERROR", "Failed to verify credentials", req.correlationId);
    }
});

function requireAdmin(req, res) {
    if (req.identity?.role !== "IT Admin") {
        errorResponse(res, 403, "FORBIDDEN", "Only IT Admin may manage users", req.correlationId);
        return false;
    }
    return true;
}

app.post("/api/v1/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { username, password, role, name, email } = req.body || {};
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) return errorResponse(res, 400, "VALIDATION_ERROR", "username must be 3-50 characters: letters, digits, _ . -", req.correlationId);
    if (typeof password !== "string" || password.length < 8 || password.length > 200) return errorResponse(res, 400, "VALIDATION_ERROR", "password must be 8-200 characters", req.correlationId);
    if (!VALID_ROLES.includes(role)) return errorResponse(res, 400, "VALIDATION_ERROR", `role must be one of: ${VALID_ROLES.join(", ")}`, req.correlationId);
    if (name !== undefined && (typeof name !== "string" || name.length > 100)) return errorResponse(res, 400, "VALIDATION_ERROR", "name must be a string up to 100 characters", req.correlationId);
    if (email !== undefined && (typeof email !== "string" || email.length > 150 || !/^[^\s@]+@[^\s@]+$/.test(email))) return errorResponse(res, 400, "VALIDATION_ERROR", "email is invalid", req.correlationId);
    try {
        const roleRows = await queryAsync("SELECT role_id FROM roles WHERE role_name = ?", [role]);
        if (!roleRows.length) return errorResponse(res, 400, "VALIDATION_ERROR", "Unknown role", req.correlationId);
        const passwordHash = await bcrypt.hash(password, 10);
        const created = await transactionAsync(async () => {
            const result = await queryAsync(
                "INSERT INTO users (role_id, username, name, email, password_hash) VALUES (?, ?, ?, ?, ?)",
                [roleRows[0].role_id, username, name || username, email || `${username}@company.com`, passwordHash]
            );
            await queryAsync(
                "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'CREATE', 'USERS', ?, ?)",
                [req.identity.userId, result.insertId, req.correlationId]
            );
            return result.insertId;
        });
        return successResponse(res, 201, { user_id: created, username, role, is_active: true }, req.correlationId);
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") return errorResponse(res, 409, "USER_EXISTS", "Username or email already exists", req.correlationId);
        return errorResponse(res, 500, "DATABASE_ERROR", "Failed to create user", req.correlationId);
    }
});

app.get("/api/v1/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
        const rows = await queryAsync("SELECT u.user_id, u.username, u.name, u.email, u.is_active, r.role_name AS role FROM users u JOIN roles r ON r.role_id = u.role_id ORDER BY u.user_id");
        return successResponse(res, 200, rows, req.correlationId);
    } catch (err) {
        return errorResponse(res, 500, "DATABASE_ERROR", "Failed to list users", req.correlationId);
    }
});

app.patch("/api/v1/users/:userId", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!/^[1-9][0-9]*$/.test(req.params.userId)) return errorResponse(res, 400, "INVALID_USER_ID", "Invalid user ID", req.correlationId);
    if (typeof req.body?.is_active !== "boolean") return errorResponse(res, 400, "VALIDATION_ERROR", "is_active (boolean) is required", req.correlationId);
    const targetId = Number(req.params.userId);
    if (targetId === req.identity.userId && req.body.is_active === false) return errorResponse(res, 409, "SELF_DISABLE", "You cannot disable your own account", req.correlationId);
    try {
        const result = await queryAsync("UPDATE users SET is_active = ? WHERE user_id = ?", [req.body.is_active ? 1 : 0, targetId]);
        if (!result.affectedRows) return errorResponse(res, 404, "USER_NOT_FOUND", "User not found", req.correlationId);
        await queryAsync("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, ?, 'USERS', ?, ?)", [req.identity.userId, req.body.is_active ? "ENABLE" : "DISABLE", targetId, req.correlationId]);
        return successResponse(res, 200, { user_id: targetId, is_active: req.body.is_active }, req.correlationId);
    } catch (err) {
        return errorResponse(res, 500, "DATABASE_ERROR", "Failed to update user", req.correlationId);
    }
});

app.get("/api/v1/integration/users/:userId", (req, res) => {
    if (!/^[1-9][0-9]*$/.test(req.params.userId)) return errorResponse(res, 400, "INVALID_USER_ID", "Invalid user ID", req.correlationId);
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) return errorResponse(res, 400, "INVALID_USER_ID", "Invalid user ID", req.correlationId);
    db.query("SELECT u.user_id, u.is_active, r.role_name AS role FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?", [userId], (err, rows) => {
        if (err) return errorResponse(res, 500, "DATABASE_ERROR", "Failed to validate user", req.correlationId);
        if (!rows.length) return errorResponse(res, 404, "USER_NOT_FOUND", "User not found", req.correlationId);
        if (Number(rows[0].is_active) !== 1) return errorResponse(res, 403, "USER_DISABLED", "User is disabled", req.correlationId);
        return successResponse(res, 200, { user_id: rows[0].user_id, role: rows[0].role }, req.correlationId);
    });
});

app.get("/api/v1/files/:fileId", (req, res) => {
    const fileId = Number(req.params.fileId);
    if (!Number.isSafeInteger(fileId) || fileId < 1) return errorResponse(res, 400, "INVALID_FILE_ID", "Invalid file ID", req.correlationId);
    const sql = `SELECT file_id, user_id, location_id, policy_id, file_name, source_path, source_path AS object_key, created_at FROM files WHERE file_id = ?`;
    db.query(sql, [fileId], (err, rows) => {
        if (err) return errorResponse(res, 500, "DATABASE_ERROR", "Failed to fetch file", req.correlationId);
        if (!rows.length) return errorResponse(res, 404, "FILE_NOT_FOUND", "File not found", req.correlationId);
        return successResponse(res, 200, rows[0], req.correlationId);
    });
});

app.get("/api/v1/files", (req, res) => {

    const ownerFilter = req.identity.role === "Employee" ? "WHERE user_id = ?" : "";
    const sql = `
        SELECT
            file_id,
            user_id,
            location_id,
            policy_id,
            file_name,
            source_path,
            source_path AS object_key,
            created_at
        FROM files
        ${ownerFilter}
        ORDER BY file_id
    `;
    const params = req.identity.role === "Employee" ? [req.identity.userId] : [];
    db.query(sql, params, (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch files",
                req.correlationId,
                [err.message]
            );
        }

        return successResponse(
            res,
            200,
            results,
            req.correlationId
        );
    });
});

// =====================================================
// CREATE FILE
// Official: POST /api/v1/files
// =====================================================

app.post(
    "/api/v1/files",
    (req, res, next) => {
        fileUpload.single("file")(req, res, (err) => {
            if (!err) {
                return next();
            }

            if (err instanceof multer.MulterError) {
                return errorResponse(
                    res,
                    400,
                    "INVALID_UPLOAD",
                    err.code === "LIMIT_FILE_SIZE"
                        ? `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB upload limit`
                        : "Invalid multipart file upload",
                    req.correlationId,
                    [{ code: err.code }]
                );
            }

            console.error("File upload parsing failed:", err.message);
            return errorResponse(
                res,
                500,
                "UPLOAD_ERROR",
                "Failed to process file upload",
                req.correlationId
            );
        });
    },
    async (req, res) => {
        const {
            user_id: submittedUserId,
            location_id,
            policy_id,
            file_name
        } = req.body;
        const file = req.file;
        const normalizedUserId = Number(req.identity.userId);
        const suppliedUserId = typeof submittedUserId === "string" ? submittedUserId : String(submittedUserId ?? "");
        const normalizedFileName =
            typeof file_name === "string" ? path.basename(file_name.trim()) : "";

        if (
            !Number.isInteger(normalizedUserId) ||
            normalizedUserId <= 0 ||
            !normalizedFileName ||
            !file
        ) {
            return errorResponse(
                res,
                400,
                "INVALID_REQUEST",
            "file_name and a nonempty multipart file field named 'file' are required",
                req.correlationId
            );
        }
        if (!/^[1-9][0-9]*$/.test(suppliedUserId)) {
            return errorResponse(res, 400, "INVALID_REQUEST", "A positive numeric multipart user_id is required", req.correlationId);
        }
        if (Number(suppliedUserId) !== normalizedUserId) {
            return errorResponse(res, 403, "IDENTITY_MISMATCH", "Multipart user_id must match the authenticated Team C identity", req.correlationId);
        }
        if (!file.size || !file.buffer?.length) return errorResponse(res, 400, "INVALID_UPLOAD", "Uploaded file must not be empty", req.correlationId);

        const idempotencyKey = (req.get("Idempotency-Key") || "").trim();
        if (!/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
            return errorResponse(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain 8 to 100 safe characters", req.correlationId);
        }
        const checksum = createHash("sha256").update(file.buffer).digest("hex");
        try {
            const existing = await queryAsync(
                `SELECT f.file_id, f.file_name, f.source_path AS object_key, fv.version_id, fv.checksum
                 FROM files f LEFT JOIN file_versions fv ON fv.file_id = f.file_id
                 WHERE f.user_id = ? AND f.upload_idempotency_key = ?
                 ORDER BY fv.version_number DESC LIMIT 1`,
                [normalizedUserId, idempotencyKey]
            );
            if (existing.length) {
                if (existing[0].file_name !== normalizedFileName || existing[0].checksum !== checksum) {
                    return errorResponse(res, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for different file content", req.correlationId);
                }
                return successResponse(res, 200, {
                    file_id: existing[0].file_id,
                    version_id: existing[0].version_id,
                    object_key: existing[0].object_key,
                    checksum
                }, req.correlationId);
            }
        } catch {
            return errorResponse(res, 503, "DATABASE_ERROR", "Could not check upload idempotency", req.correlationId);
        }

        const missingStorageConfig = [
            ["MINIO_ENDPOINT", process.env.MINIO_ENDPOINT],
            ["MINIO_ACCESS_KEY", process.env.MINIO_ACCESS_KEY],
            ["MINIO_SECRET_KEY", process.env.MINIO_SECRET_KEY],
            ["MINIO_REGION", process.env.MINIO_REGION]
        ]
            .filter(([, value]) => !value)
            .map(([name]) => name);

        if (missingStorageConfig.length > 0) {
            return errorResponse(
                res,
                500,
                "STORAGE_NOT_CONFIGURED",
                "MinIO storage is not configured",
                req.correlationId,
                missingStorageConfig
            );
        }

        const objectKey =
            `users/${normalizedUserId}/files/${randomUUID()}/${normalizedFileName}`;

        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: MINIO_BUCKET,
                Key: objectKey,
                Body: file.buffer,
                ContentLength: file.size,
                ContentType: file.mimetype || "application/octet-stream"
            }));
        } catch (uploadError) {
            console.error("MinIO file upload failed:", uploadError.message);
            return errorResponse(
                res,
                502,
                "STORAGE_UPLOAD_FAILED",
                "Failed to upload file to MinIO",
                req.correlationId
            );
        }

        try {
            const created = await transactionAsync(async () => {
                const fileResult = await queryAsync(
                    `INSERT INTO files (user_id, location_id, policy_id, file_name, source_path, upload_idempotency_key)
                     VALUES (?, ?, COALESCE(?, (SELECT MIN(policy_id) FROM retention_policies)), ?, ?, ?)`,
                    [normalizedUserId, location_id || null, policy_id || null, normalizedFileName, objectKey, idempotencyKey]
                );
                const versionResult = await queryAsync(
                    `INSERT INTO file_versions (file_id, version_number, checksum, size_bytes, state, object_key)
                     VALUES (?, 1, ?, ?, 'COMMITTED', ?)`,
                    [fileResult.insertId, checksum, file.size, objectKey]
                );
                await queryAsync(
                    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'UPLOAD', 'FILES', ?, ?)`,
                    [normalizedUserId, fileResult.insertId, req.correlationId]
                );
                return { fileId: fileResult.insertId, versionId: versionResult.insertId };
            });

            return successResponse(
                res,
                201,
                {
                    file_id: created.fileId,
                    version_id: created.versionId,
                    object_key: objectKey,
                    checksum
                },
                req.correlationId
            );
        } catch (databaseError) {
            const details = [];

            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: MINIO_BUCKET,
                    Key: objectKey
                }));
            } catch (cleanupError) {
                console.error(
                    `Failed to remove MinIO object ${objectKey} after database insert failure:`,
                    cleanupError.message
                );
                details.push(
                    `Uploaded object cleanup failed; object may remain at ${objectKey}`
                );
            }

            const duplicateKey = databaseError.code === "ER_DUP_ENTRY";
            return errorResponse(
                res,
                duplicateKey ? 409 : 500,
                duplicateKey ? "IDEMPOTENCY_CONFLICT" : "DATABASE_ERROR",
                duplicateKey ? "Upload idempotency key already exists" : "Failed to create file metadata and version",
                req.correlationId,
                details
            );
        }
    }
);

// =====================================================
// UPDATE FILE
// Official: PATCH /api/v1/files/:fileId
// =====================================================

app.patch("/api/v1/files/:fileId", async (req, res) => {
    const fileId = Number(req.params.fileId);

    if (!fileId) {
        return errorResponse(
            res,
            400,
            "INVALID_FILE_ID",
            "Invalid file ID",
            req.correlationId
        );
    }

    const {
        file_name,
        location_id,
        policy_id
    } = req.body;

    const sql = `
        UPDATE files
        SET
            file_name = COALESCE(?, file_name),
            location_id = COALESCE(?, location_id),
            policy_id = COALESCE(?, policy_id)
        WHERE file_id = ?
    `;

    try {
        await transactionAsync(async () => {
            const result = await queryAsync(sql, [file_name || null, location_id || null, policy_id || null, fileId]);
            if (!result.affectedRows) throw Object.assign(new Error("File not found"), { code: "FILE_NOT_FOUND" });
            await queryAsync("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'UPDATE_METADATA', 'FILES', ?, ?)", [req.identity.userId, fileId, req.correlationId]);
        });
        return successResponse(res, 200, { file_id: fileId }, req.correlationId);
    } catch (err) {
        return errorResponse(res, err.code === "FILE_NOT_FOUND" ? 404 : 500, err.code || "DATABASE_ERROR", err.code === "FILE_NOT_FOUND" ? "File not found" : "Failed to update file metadata and audit", req.correlationId);
    }
});

// =====================================================
// DELETE FILE
// =====================================================

app.delete("/api/v1/files/:fileId", async (req, res) => {

    const fileId = Number(req.params.fileId);

    if (!fileId) {
        return errorResponse(
            res,
            400,
            "INVALID_FILE_ID",
            "Invalid file ID",
            req.correlationId
        );
    }

    const sql = `
        DELETE FROM files
        WHERE file_id = ?
    `;

    try {
        await transactionAsync(async () => {
            const result = await queryAsync(sql, [fileId]);
            if (!result.affectedRows) throw Object.assign(new Error("File not found"), { code: "FILE_NOT_FOUND" });
            await queryAsync("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'DELETE', 'FILES', ?, ?)", [req.identity.userId, fileId, req.correlationId]);
        });
        return successResponse(res, 200, { file_id: fileId, deleted: true }, req.correlationId);
    } catch (err) {
        if (err.code === "ER_ROW_IS_REFERENCED_2") return errorResponse(res, 409, "FILE_HAS_BACKUPS", "File has backup/restore history and cannot be deleted while it is referenced", req.correlationId);
        return errorResponse(res, err.code === "FILE_NOT_FOUND" ? 404 : 500, err.code || "DATABASE_ERROR", err.code === "FILE_NOT_FOUND" ? "File not found" : "Failed to delete file and write audit", req.correlationId);
    }
});

// =====================================================
// GET FILE VERSIONS
// Official: GET /api/v1/files/:fileId/versions
// =====================================================

app.get("/api/v1/files/:fileId/versions", (req, res) => {

    const fileId = Number(req.params.fileId);

    if (!fileId) {
        return errorResponse(
            res,
            400,
            "INVALID_FILE_ID",
            "Invalid file ID",
            req.correlationId
        );
    }

    const sql = `
        SELECT
            version_id,
            file_id,
            version_number,
            checksum,
            size_bytes,
            state,
            created_at
        FROM file_versions
        WHERE file_id = ?
        ORDER BY version_number DESC, version_id DESC
    `;

    db.query(sql, [fileId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch file versions",
                req.correlationId,
                [err.message]
            );
        }

        return successResponse(
            res,
            200,
            results,
            req.correlationId
        );
    });
});

// =====================================================
// VERSION RETENTION STATUS
// Official Team C retention support
// GET /api/v1/files/:fileId/retention
// =====================================================

app.get("/api/v1/files/:fileId/retention", (req, res) => {

    const fileId = Number(req.params.fileId);

    if (!fileId) {
        return errorResponse(
            res,
            400,
            "INVALID_FILE_ID",
            "Invalid file ID",
            req.correlationId
        );
    }

    const sql = `
        SELECT
            fv.version_id,
            fv.file_id,
            f.file_name,
            fv.version_number,
            fv.state,
            fv.created_at,
            rp.policy_id,
            rp.policy_name,
            rp.duration_days,
            DATEDIFF(CURDATE(), fv.created_at) AS age_days,
            CASE
                WHEN DATEDIFF(CURDATE(), fv.created_at) >= rp.duration_days
                THEN 'EXPIRED'
                ELSE 'ACTIVE'
            END AS retention_status
        FROM file_versions fv
        INNER JOIN files f
            ON fv.file_id = f.file_id
        INNER JOIN retention_policies rp
            ON f.policy_id = rp.policy_id
        WHERE fv.file_id = ?
        ORDER BY fv.version_number DESC, fv.version_id DESC
    `;

    db.query(sql, [fileId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch retention status",
                req.correlationId,
                [err.message]
            );
        }

        if (results.length === 0) {
            return errorResponse(
                res,
                404,
                "FILE_NOT_FOUND",
                "No versions found for this file",
                req.correlationId
            );
        }

        return successResponse(
            res,
            200,
            results,
            req.correlationId
        );
    });
});

// =====================================================
// GET VERSION CHUNKS
// Reads Team B chunk tables.
// Team C does NOT implement chunking.
// =====================================================

app.get("/api/v1/versions/:versionId/chunks", (req, res) => {

    const versionId = Number(req.params.versionId);

    if (!versionId) {
        return errorResponse(
            res,
            400,
            "INVALID_VERSION_ID",
            "Invalid version ID",
            req.correlationId
        );
    }

    const sql = `
        SELECT
            vc.version_id,
            vc.chunk_id,
            c.chunk_hash AS hash_value,
            c.chunk_size AS size_bytes,
            c.storage_ref AS storage_path
        FROM version_chunks vc
        INNER JOIN chunks c
            ON vc.chunk_id = c.chunk_id
        WHERE vc.version_id = ?
        ORDER BY vc.sequence_no
    `;

    db.query(sql, [versionId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch version chunks",
                req.correlationId,
                [err.message]
            );
        }

        return successResponse(
            res,
            200,
            results,
            req.correlationId
        );
    });
});

// =====================================================
// CREATE BACKUP
// Official: POST /api/v1/backups
//
// Idempotency:
// Accepts official Idempotency-Key header.
// Body idempotency_key is also supported for compatibility.
//
// TRANSACTION:
// backup_jobs INSERT + audit_log INSERT
// =====================================================

app.post("/api/v1/backups", (req, res) => {

    const {
        file_id,
        version_id,
        backup_type
    } = req.body;
    const user_id = req.identity.userId;
    if (req.body.user_id !== undefined && Number(req.body.user_id) !== Number(user_id)) return errorResponse(res, 403, "IDENTITY_MISMATCH", "Submitted user_id does not match authenticated identity", req.correlationId);

    const idempotencyKey =
        req.header("Idempotency-Key") ||
        req.body.idempotency_key;

    const correlationId = req.correlationId;

    if (
        !user_id ||
        !file_id ||
        !version_id ||
        !backup_type ||
        !idempotencyKey
    ) {
        return errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "user_id, file_id, version_id, backup_type and Idempotency-Key are required",
            correlationId
        );
    }

    // -------------------------------------------------
    // CHECK DUPLICATE IDEMPOTENCY KEY
    // -------------------------------------------------

    const duplicateSql = `
        SELECT
            backup_id,
            state,
            correlation_id
        FROM backup_jobs
        WHERE idempotency_key = ?
    `;

    db.query(
        duplicateSql,
        [idempotencyKey],
        (err, duplicateResults) => {

            if (err) {
                return errorResponse(
                    res,
                    500,
                    "DATABASE_ERROR",
                    "Failed to check idempotency key",
                    correlationId,
                    [err.message]
                );
            }

            if (duplicateResults.length > 0) {

                return errorResponse(
                    res,
                    409,
                    "RESOURCE_CONFLICT",
                    "Backup request already exists",
                    correlationId,
                    [
                        {
                            backup_id: duplicateResults[0].backup_id,
                            state: duplicateResults[0].state,
                            correlation_id:
                                duplicateResults[0].correlation_id
                        }
                    ]
                );
            }

            // -------------------------------------------------
            // CHECK FILE
            // -------------------------------------------------

            const fileSql = `
                SELECT file_id, source_path AS object_key
                FROM files
                WHERE file_id = ?
            `;

            db.query(
                fileSql,
                [file_id],
                (err, fileResults) => {

                    if (err) {
                        return errorResponse(
                            res,
                            500,
                            "DATABASE_ERROR",
                            "Failed to validate file",
                            correlationId,
                            [err.message]
                        );
                    }

                    if (fileResults.length === 0) {
                        return errorResponse(
                            res,
                            404,
                            "FILE_NOT_FOUND",
                            "File not found",
                            correlationId
                        );
                    }

                    // -------------------------------------------------
                    // CHECK VERSION BELONGS TO FILE
                    // -------------------------------------------------

                    const versionSql = `
                        SELECT version_id, version_number
                        FROM file_versions
                        WHERE version_id = ?
                        AND file_id = ?
                    `;

                    db.query(
                        versionSql,
                        [version_id, file_id],
                        (err, versionResults) => {

                            if (err) {
                                return errorResponse(
                                    res,
                                    500,
                                    "DATABASE_ERROR",
                                    "Failed to validate file version",
                                    correlationId,
                                    [err.message]
                                );
                            }

                            if (versionResults.length === 0) {
                                return errorResponse(
                                    res,
                                    400,
                                    "INVALID_VERSION",
                                    "Version does not belong to the specified file",
                                    correlationId
                                );
                            }

                            // -------------------------------------------------
                            // START TRANSACTION
                            // -------------------------------------------------

                            db.beginTransaction((transactionErr) => {

                                if (transactionErr) {
                                    return errorResponse(
                                        res,
                                        500,
                                        "TRANSACTION_ERROR",
                                        "Failed to start backup transaction",
                                        correlationId,
                                        [transactionErr.message]
                                    );
                                }

                                const insertSql = `
                                    INSERT INTO backup_jobs
                                    (
                                        user_id,
                                        file_id,
                                        version_id,
                                        backup_type,
                                        idempotency_key,
                                        state,
                                        correlation_id
                                    )
                                    VALUES
                                    (?, ?, ?, ?, ?, 'REQUESTED', ?)
                                `;

                                db.query(
                                    insertSql,
                                    [
                                        user_id,
                                        file_id,
                                        version_id,
                                        backup_type,
                                        idempotencyKey,
                                        correlationId
                                    ],
                                    (insertErr, result) => {

                                        if (insertErr) {

                                            return db.rollback(() => {

                                                if (
                                                    insertErr.code ===
                                                    "ER_DUP_ENTRY"
                                                ) {
                                                    return errorResponse(
                                                        res,
                                                        409,
                                                        "RESOURCE_CONFLICT",
                                                        "Backup request already exists",
                                                        correlationId
                                                    );
                                                }

                                                return errorResponse(
                                                    res,
                                                    500,
                                                    "DATABASE_ERROR",
                                                    "Failed to create backup",
                                                    correlationId,
                                                    [insertErr.message]
                                                );
                                            });
                                        }

                                        const backupId =
                                            result.insertId;

                                        // -------------------------------------------------
                                        // AUDIT
                                        // -------------------------------------------------

                                        const auditSql = `
                                            INSERT INTO audit_log
                                            (
                                                actor_id,
                                                action,
                                                entity_type,
                                                entity_id,
                                                correlation_id
                                            )
                                            VALUES
                                            (?, 'CREATE', 'BACKUP_JOBS', ?, ?)
                                        `;

                                        db.query(
                                            auditSql,
                                            [
                                                user_id,
                                                backupId,
                                                correlationId
                                            ],
                                            (auditErr) => {

                                                if (auditErr) {

                                                    return db.rollback(() => {

                                                        return errorResponse(
                                                            res,
                                                            500,
                                                            "AUDIT_ERROR",
                                                            "Backup transaction rolled back because audit logging failed",
                                                            correlationId,
                                                            [auditErr.message]
                                                        );
                                                    });
                                                }

                                                // -------------------------------------------------
                                                // COMMIT
                                                // -------------------------------------------------

                                                db.commit((commitErr) => {

                                                    if (commitErr) {

                                                        return db.rollback(() => {

                                                            return errorResponse(
                                                                res,
                                                                500,
                                                                "TRANSACTION_ERROR",
                                                                "Backup transaction could not be committed",
                                                                correlationId,
                                                                [commitErr.message]
                                                            );
                                                        });
                                                    }

                                                    scheduleBackupWithTeamA({
                                                        backupId,
                                                        userId: user_id,
                                                        fileId: file_id,
                                                        backupType: backup_type,
                                                        objectKey: fileResults[0].object_key,
                                                        correlationId,
                                                        idempotencyKey
                                                    })
                                                        .then((teamA) => {
                                                            successResponse(res, 201, {
                                                                backup_id: backupId,
                                                                state: "REQUESTED",
                                                                version_id,
                                                                backup_type,
                                                                idempotency_key: idempotencyKey,
                                                                team_a: { status: "SCHEDULED", job_id: teamA.job_id }
                                                            }, correlationId);
                                                            setImmediate(() => runBackupWorker(backupId, user_id, file_id, version_id, correlationId, idempotencyKey));
                                                        })
                                                        .catch(async (teamAError) => {
                                                            console.error("Team A integration failed:", teamAError.message);
                                                            await queryAsync("UPDATE backup_jobs SET state='FAILED', failure_reason=? WHERE backup_id=? AND state='REQUESTED'", ["TEAM_A_SCHEDULING_FAILED", backupId]).catch(() => {});
                                                            await queryAsync("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'BACKUP_FAILED', 'BACKUP_JOBS', ?, ?)", [user_id, backupId, correlationId]).catch(() => {});
                                                            if (!res.headersSent) errorResponse(res, 502, "TEAM_A_SCHEDULING_FAILED", "Backup could not be scheduled", correlationId);
                                                        });
                                                });
                                            }
                                        );
                                    }
                                );
                            });
                        }
                    );
                }
            );
        }
    );
});

// =====================================================
// GET BACKUP
// Official: GET /api/v1/backups/:backupId
// =====================================================

app.get("/api/v1/backups/:backupId", (req, res) => {

    const backupId = Number(req.params.backupId);

    if (!backupId) {
        return errorResponse(
            res,
            400,
            "INVALID_BACKUP_ID",
            "Invalid backup ID",
            req.correlationId
        );
    }

    const sql = `
        SELECT
            bj.backup_id,
            bj.user_id,
            u.name AS requested_by,
            bj.file_id,
            f.file_name,
            bj.version_id,
            bj.backup_type,
            bj.idempotency_key,
            bj.state,
            bj.backup_object_key,
            bj.team_b_manifest_status,
            bj.team_b_dedup_result_id,
            bj.team_b_merkle_root,
            bj.team_b_source_provider,
            bj.team_b_source_bucket,
            bj.team_b_source_key,
            bj.team_b_manifest_error,
            bj.correlation_id,
            bj.created_at,
            bj.committed_at
        FROM backup_jobs bj
        INNER JOIN users u
            ON bj.user_id = u.user_id
        INNER JOIN files f
            ON bj.file_id = f.file_id
        WHERE bj.backup_id = ?
    `;

    db.query(sql, [backupId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch backup",
                req.correlationId,
                [err.message]
            );
        }

        if (results.length === 0) {
            return errorResponse(
                res,
                404,
                "BACKUP_NOT_FOUND",
                "Backup not found",
                req.correlationId
            );
        }

        return successResponse(
            res,
            200,
            results[0],
            req.correlationId
        );
    });
});

// Explicitly retry Team B manifest creation after a transient failure. The stable
// Team C backup ID is reused, and the conditional DB claim prevents concurrent calls.
app.post("/api/v1/backups/:backupId/team-b/compute", async (req, res) => {
    const backupId = Number(req.params.backupId);
    if (!Number.isSafeInteger(backupId) || backupId < 1) return errorResponse(res, 400, "INVALID_BACKUP_ID", "Invalid backup ID", req.correlationId);
    try {
        const rows = await queryAsync(
            "SELECT backup_id, file_id, version_id, state, backup_object_key, team_b_manifest_status FROM backup_jobs WHERE backup_id=?",
            [backupId]
        );
        if (!rows.length) return errorResponse(res, 404, "BACKUP_NOT_FOUND", "Backup not found", req.correlationId);
        const backup = rows[0];
        if (backup.state !== "COMPLETED" || !backup.backup_object_key) return errorResponse(res, 409, "BACKUP_NOT_READY", "Team B compute requires a completed backup object", req.correlationId);
        if (backup.team_b_manifest_status === "READY") return successResponse(res, 200, { backup_id: backupId, manifest_status: "READY", already_ready: true }, req.correlationId);
        if (backup.team_b_manifest_status === "PENDING") return errorResponse(res, 409, "TEAM_B_COMPUTE_IN_PROGRESS", "Team B manifest compute is already in progress", req.correlationId);
        const result = await createTeamBManifest({
            backupId,
            fileId: backup.file_id,
            versionId: backup.version_id,
            objectKey: backup.backup_object_key,
            correlationId: req.correlationId
        });
        if (result.status === "READY") return successResponse(res, 200, { backup_id: backupId, manifest_status: "READY", dedup_result_id: result.dedupResultId, merkle_root: result.merkleRoot, source: result.source }, req.correlationId);
        if (result.status === "PENDING") return errorResponse(res, 409, "TEAM_B_COMPUTE_IN_PROGRESS", "Team B manifest compute is already in progress", req.correlationId);
        if (result.status === "SKIPPED") return errorResponse(res, 503, "TEAM_B_NOT_CONFIGURED", "Team B integration is not configured", req.correlationId);
        return errorResponse(res, 502, "TEAM_B_MANIFEST_FAILED", "Team B did not create the backup manifest", req.correlationId);
    } catch (error) {
        console.error("Team B manifest retry failed:", error.message);
        return errorResponse(res, 500, "TEAM_B_RETRY_ERROR", "Could not retry Team B manifest compute", req.correlationId);
    }
});

// =====================================================
// LIST BACKUPS / LIST RESTORES
// Employee: own records only. IT Admin / Auditor: all (optional filters).
// =====================================================

const BACKUP_STATES = ["REQUESTED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];
const RESTORE_STATES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];

function pageParams(query) {
    return {
        limit: Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200),
        offset: Math.max(parseInt(query.offset, 10) || 0, 0)
    };
}

app.get("/api/v1/backups", async (req, res) => {
    const { limit, offset } = pageParams(req.query);
    const where = [];
    const params = [];
    if (req.identity.role === "Employee") {
        where.push("bj.user_id = ?"); params.push(req.identity.userId);
    } else if (req.query.user_id !== undefined) {
        if (!/^[1-9][0-9]*$/.test(String(req.query.user_id))) return errorResponse(res, 400, "VALIDATION_ERROR", "user_id must be a positive integer", req.correlationId);
        where.push("bj.user_id = ?"); params.push(Number(req.query.user_id));
    }
    if (req.query.file_id !== undefined) {
        if (!/^[1-9][0-9]*$/.test(String(req.query.file_id))) return errorResponse(res, 400, "VALIDATION_ERROR", "file_id must be a positive integer", req.correlationId);
        where.push("bj.file_id = ?"); params.push(Number(req.query.file_id));
    }
    if (req.query.state !== undefined) {
        if (!BACKUP_STATES.includes(req.query.state)) return errorResponse(res, 400, "VALIDATION_ERROR", `state must be one of: ${BACKUP_STATES.join(", ")}`, req.correlationId);
        where.push("bj.state = ?"); params.push(req.query.state);
    }
    try {
        const rows = await queryAsync(
            `SELECT bj.backup_id, bj.user_id, bj.file_id, f.file_name, bj.version_id, bj.backup_type,
                    bj.state, bj.team_b_manifest_status, bj.team_b_dedup_result_id, bj.team_b_merkle_root,
                    bj.created_at, bj.committed_at
             FROM backup_jobs bj JOIN files f ON f.file_id = bj.file_id
             ${where.length ? "WHERE " + where.join(" AND ") : ""}
             ORDER BY bj.backup_id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return successResponse(res, 200, rows, req.correlationId);
    } catch (err) {
        return errorResponse(res, 500, "DATABASE_ERROR", "Failed to list backups", req.correlationId);
    }
});

app.get("/api/v1/restores", async (req, res) => {
    const { limit, offset } = pageParams(req.query);
    const where = [];
    const params = [];
    if (req.identity.role === "Employee") {
        where.push("rr.user_id = ?"); params.push(req.identity.userId);
    } else if (req.query.user_id !== undefined) {
        if (!/^[1-9][0-9]*$/.test(String(req.query.user_id))) return errorResponse(res, 400, "VALIDATION_ERROR", "user_id must be a positive integer", req.correlationId);
        where.push("rr.user_id = ?"); params.push(Number(req.query.user_id));
    }
    if (req.query.backup_id !== undefined) {
        if (!/^[1-9][0-9]*$/.test(String(req.query.backup_id))) return errorResponse(res, 400, "VALIDATION_ERROR", "backup_id must be a positive integer", req.correlationId);
        where.push("rr.backup_id = ?"); params.push(Number(req.query.backup_id));
    }
    if (req.query.commit_status !== undefined) {
        if (!RESTORE_STATES.includes(req.query.commit_status)) return errorResponse(res, 400, "VALIDATION_ERROR", `commit_status must be one of: ${RESTORE_STATES.join(", ")}`, req.correlationId);
        where.push("rr.commit_status = ?"); params.push(req.query.commit_status);
    }
    try {
        const rows = await queryAsync(
            `SELECT rr.restore_id, rr.backup_id, rr.version_id, rr.user_id, rr.commit_status,
                    rr.requested_at, rr.completed_at
             FROM restore_requests rr
             ${where.length ? "WHERE " + where.join(" AND ") : ""}
             ORDER BY rr.restore_id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return successResponse(res, 200, rows, req.correlationId);
    } catch (err) {
        return errorResponse(res, 500, "DATABASE_ERROR", "Failed to list restores", req.correlationId);
    }
});

// =====================================================
// COMPLETE BACKUP
// Official development helper:
// POST /api/v1/backups/:backupId/complete
//
// TRANSACTION:
// backup_jobs UPDATE + audit_log INSERT
// =====================================================

app.post("/api/v1/backups/:backupId/complete", (req, res) => {

    return errorResponse(res, 409, "WORKER_OWNED_STATE", "Backup state is updated only by the verified execution worker", req.correlationId);

    const backupId = Number(req.params.backupId);

    if (!backupId) {
        return errorResponse(
            res,
            400,
            "INVALID_BACKUP_ID",
            "Invalid backup ID",
            req.correlationId
        );
    }

    const getSql = `
        SELECT
            user_id,
            correlation_id,
            state
        FROM backup_jobs
        WHERE backup_id = ?
    `;

    db.query(getSql, [backupId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to check backup",
                req.correlationId,
                [err.message]
            );
        }

        if (results.length === 0) {
            return errorResponse(
                res,
                404,
                "BACKUP_NOT_FOUND",
                "Backup not found",
                req.correlationId
            );
        }

        const backup = results[0];

        if (backup.state !== "REQUESTED") {
            return errorResponse(
                res,
                409,
                "RESOURCE_CONFLICT",
                "Backup cannot be completed",
                req.correlationId,
                [
                    {
                        current_state: backup.state
                    }
                ]
            );
        }

        db.beginTransaction((transactionErr) => {

            if (transactionErr) {
                return errorResponse(
                    res,
                    500,
                    "TRANSACTION_ERROR",
                    "Failed to start backup completion transaction",
                    req.correlationId,
                    [transactionErr.message]
                );
            }

            const updateSql = `
                UPDATE backup_jobs
                SET
                    state = 'COMPLETED',
                    committed_at = CURRENT_TIMESTAMP
                WHERE backup_id = ?
                AND state = 'REQUESTED'
            `;

            db.query(
                updateSql,
                [backupId],
                (updateErr, result) => {

                    if (updateErr) {

                        return db.rollback(() => {

                            return errorResponse(
                                res,
                                500,
                                "DATABASE_ERROR",
                                "Failed to complete backup",
                                req.correlationId,
                                [updateErr.message]
                            );
                        });
                    }

                    if (result.affectedRows === 0) {

                        return db.rollback(() => {

                            return errorResponse(
                                res,
                                409,
                                "RESOURCE_CONFLICT",
                                "Backup state changed before completion",
                                req.correlationId
                            );
                        });
                    }

                    const auditSql = `
                        INSERT INTO audit_log
                        (
                            actor_id,
                            action,
                            entity_type,
                            entity_id,
                            correlation_id
                        )
                        VALUES
                        (
                            ?,
                            'STATE_CHANGE_TO_COMPLETED',
                            'BACKUP_JOBS',
                            ?,
                            ?
                        )
                    `;

                    db.query(
                        auditSql,
                        [
                            req.identity.userId,
                            backupId,
                            backup.correlation_id
                        ],
                        (auditErr) => {

                            if (auditErr) {

                                return db.rollback(() => {

                                    return errorResponse(
                                        res,
                                        500,
                                        "AUDIT_ERROR",
                                        "Backup completion rolled back because audit logging failed",
                                        req.correlationId,
                                        [auditErr.message]
                                    );
                                });
                            }

                            db.commit((commitErr) => {

                                if (commitErr) {

                                    return db.rollback(() => {

                                        return errorResponse(
                                            res,
                                            500,
                                            "TRANSACTION_ERROR",
                                            "Backup completion transaction could not be committed",
                                            req.correlationId,
                                            [commitErr.message]
                                        );
                                    });
                                }

                                releaseBackupLockWithTeamA(
                                    backupId,
                                    req.correlationId
                                )
                                    .catch((teamAError) => {
                                        console.error(
                                            "Team A lock release failed:",
                                            teamAError.message
                                        );
                                    })
                                    .finally(() => {
                                        return successResponse(
                                            res,
                                            200,
                                            {
                                                backup_id: backupId,
                                                state: "COMPLETED",
                                                team_a: {
                                                    lock_released: !teamALeaseIds.has(backupId)
                                                }
                                            },
                                            req.correlationId
                                        );
                                    });
                            });
                        }
                    );
                }
            );
        });
    });
});

// =====================================================
// CANCEL BACKUP
// Official: POST /api/v1/backups/:backupId/cancel
//
// TRANSACTION:
// backup_jobs UPDATE + audit_log INSERT
// =====================================================

app.post("/api/v1/backups/:backupId/cancel", (req, res) => {

    const backupId = Number(req.params.backupId);

    if (!backupId) {
        return errorResponse(
            res,
            400,
            "INVALID_BACKUP_ID",
            "Invalid backup ID",
            req.correlationId
        );
    }

    const getSql = `
        SELECT
            user_id,
            state,
            correlation_id
        FROM backup_jobs
        WHERE backup_id = ?
    `;

    db.query(getSql, [backupId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to check backup",
                req.correlationId,
                [err.message]
            );
        }

        if (results.length === 0) {
            return errorResponse(
                res,
                404,
                "BACKUP_NOT_FOUND",
                "Backup not found",
                req.correlationId
            );
        }

        const backup = results[0];

        if (backup.state !== "REQUESTED") {
            return errorResponse(
                res,
                409,
                "RESOURCE_CONFLICT",
                "Only a REQUESTED backup can be cancelled",
                req.correlationId,
                [
                    {
                        current_state: backup.state
                    }
                ]
            );
        }

        db.beginTransaction((transactionErr) => {

            if (transactionErr) {
                return errorResponse(
                    res,
                    500,
                    "TRANSACTION_ERROR",
                    "Failed to start backup cancellation transaction",
                    req.correlationId,
                    [transactionErr.message]
                );
            }

            const updateSql = `
                UPDATE backup_jobs
                SET state = 'CANCELLED'
                WHERE backup_id = ?
                AND state = 'REQUESTED'
            `;

            db.query(
                updateSql,
                [backupId],
                (updateErr, result) => {

                    if (updateErr) {

                        return db.rollback(() => {

                            return errorResponse(
                                res,
                                500,
                                "DATABASE_ERROR",
                                "Failed to cancel backup",
                                req.correlationId,
                                [updateErr.message]
                            );
                        });
                    }

                    if (result.affectedRows === 0) {

                        return db.rollback(() => {

                            return errorResponse(
                                res,
                                409,
                                "RESOURCE_CONFLICT",
                                "Backup state changed before cancellation",
                                req.correlationId
                            );
                        });
                    }

                    const auditSql = `
                        INSERT INTO audit_log
                        (
                            actor_id,
                            action,
                            entity_type,
                            entity_id,
                            correlation_id
                        )
                        VALUES
                        (
                            ?,
                            'CANCEL',
                            'BACKUP_JOBS',
                            ?,
                            ?
                        )
                    `;

                    db.query(
                        auditSql,
                        [
                            req.identity.userId,
                            backupId,
                            backup.correlation_id
                        ],
                        (auditErr) => {

                            if (auditErr) {

                                return db.rollback(() => {

                                    return errorResponse(
                                        res,
                                        500,
                                        "AUDIT_ERROR",
                                        "Backup cancellation rolled back because audit logging failed",
                                        req.correlationId,
                                        [auditErr.message]
                                    );
                                });
                            }

                            db.commit((commitErr) => {

                                if (commitErr) {

                                    return db.rollback(() => {

                                        return errorResponse(
                                            res,
                                            500,
                                            "TRANSACTION_ERROR",
                                            "Backup cancellation transaction could not be committed",
                                            req.correlationId,
                                            [commitErr.message]
                                        );
                                    });
                                }

                                return successResponse(
                                    res,
                                    200,
                                    {
                                        backup_id: backupId,
                                        state: "CANCELLED"
                                    },
                                    req.correlationId
                                );
                            });
                        }
                    );
                }
            );
        });
    });
});

// =====================================================
// CREATE RESTORE REQUEST
// Compatibility API
// POST /restore
//
// RETENTION CHECK:
// Version must still be inside retention period.
// =====================================================

app.post("/restore", (req, res) => {

    const { backup_id, version_id } = req.body;
    const user_id = req.identity.userId;
    if (req.body.user_id !== undefined && Number(req.body.user_id) !== Number(user_id)) return errorResponse(res, 403, "IDENTITY_MISMATCH", "Submitted user_id does not match authenticated identity", req.correlationId);

    const correlationId = req.correlationId;

    if (!backup_id || !version_id || !user_id) {
        return errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "backup_id, version_id and user_id are required",
            correlationId
        );
    }

    const backupSql = `
        SELECT
            backup_id,
            file_id,
            version_id,
            user_id,
            state
        FROM backup_jobs
        WHERE backup_id = ?
    `;

    db.query(
        backupSql,
        [backup_id],
        (err, backupResults) => {

            if (err) {
                return errorResponse(
                    res,
                    500,
                    "DATABASE_ERROR",
                    "Failed to validate backup",
                    correlationId,
                    [err.message]
                );
            }

            if (backupResults.length === 0) {
                return errorResponse(
                    res,
                    404,
                    "BACKUP_NOT_FOUND",
                    "Backup not found",
                    correlationId
                );
            }

            const backup = backupResults[0];

            if (backup.state !== "COMPLETED") {
                return errorResponse(
                    res,
                    400,
                    "INVALID_BACKUP_STATE",
                    "Backup must be COMPLETED before restore",
                    correlationId
                );
            }

            if (Number(backup.version_id) !== Number(version_id)) {
                return errorResponse(
                    res,
                    400,
                    "INVALID_VERSION",
                    "Restore version does not match backup version",
                    correlationId
                );
            }

            if (Number(backup.user_id) !== Number(user_id)) {
                return errorResponse(
                    res,
                    403,
                    "FORBIDDEN",
                    "User does not own this backup",
                    correlationId
                );
            }

            // -------------------------------------------------
            // CHECK RETENTION
            // -------------------------------------------------

            const retentionSql = `
                SELECT
                    fv.version_id,
                    fv.file_id,
                    fv.state,
                    fv.created_at,
                    rp.policy_id,
                    rp.policy_name,
                    rp.duration_days,
                    DATEDIFF(CURDATE(), fv.created_at) AS age_days
                FROM file_versions fv
                INNER JOIN files f
                    ON fv.file_id = f.file_id
                INNER JOIN retention_policies rp
                    ON f.policy_id = rp.policy_id
                WHERE fv.version_id = ?
                AND fv.file_id = ?
            `;

            db.query(
                retentionSql,
                [backup.version_id, backup.file_id],
                (retentionErr, retentionResults) => {

                    if (retentionErr) {
                        return errorResponse(
                            res,
                            500,
                            "DATABASE_ERROR",
                            "Failed to check retention policy",
                            correlationId,
                            [retentionErr.message]
                        );
                    }

                    if (retentionResults.length === 0) {
                        return errorResponse(
                            res,
                            404,
                            "VERSION_NOT_FOUND",
                            "Version retention information not found",
                            correlationId
                        );
                    }

                    const retention = retentionResults[0];

                    if (
                        Number(retention.age_days) >=
                        Number(retention.duration_days)
                    ) {
                        return errorResponse(
                            res,
                            409,
                            "RETENTION_EXPIRED",
                            "This file version has exceeded its retention period and cannot be restored",
                            correlationId,
                            [
                                {
                                    version_id:
                                        retention.version_id,
                                    policy_name:
                                        retention.policy_name,
                                    duration_days:
                                        retention.duration_days,
                                    age_days:
                                        retention.age_days
                                }
                            ]
                        );
                    }

                    // -------------------------------------------------
                    // START RESTORE TRANSACTION
                    // -------------------------------------------------

                    db.beginTransaction((transactionErr) => {

                        if (transactionErr) {
                            return errorResponse(
                                res,
                                500,
                                "TRANSACTION_ERROR",
                                "Failed to start restore transaction",
                                correlationId,
                                [transactionErr.message]
                            );
                        }

                        const insertSql = `
                            INSERT INTO restore_requests
                            (
                                backup_id,
                                version_id,
                                user_id,
                                commit_status,
                                correlation_id
                            )
                            VALUES
                            (?, ?, ?, 'PENDING', ?)
                        `;

                        db.query(
                            insertSql,
                            [
                                backup_id,
                                version_id,
                                user_id,
                                correlationId
                            ],
                            (insertErr, result) => {

                                if (insertErr) {

                                    return db.rollback(() => {

                                        return errorResponse(
                                            res,
                                            500,
                                            "DATABASE_ERROR",
                                            "Failed to create restore request",
                                            correlationId,
                                            [insertErr.message]
                                        );
                                    });
                                }

                                const restoreId =
                                    result.insertId;

                                // -------------------------------------------------
                                // AUDIT IN SAME TRANSACTION
                                // -------------------------------------------------

                                const auditSql = `
                                    INSERT INTO audit_log
                                    (
                                        actor_id,
                                        action,
                                        entity_type,
                                        entity_id,
                                        correlation_id
                                    )
                                    VALUES
                                    (
                                        ?,
                                        'CREATE',
                                        'RESTORE_REQUESTS',
                                        ?,
                                        ?
                                    )
                                `;

                                db.query(
                                    auditSql,
                                    [
                                        user_id,
                                        restoreId,
                                        correlationId
                                    ],
                                    (auditErr) => {

                                        if (auditErr) {

                                            return db.rollback(() => {

                                                return errorResponse(
                                                    res,
                                                    500,
                                                    "AUDIT_ERROR",
                                                    "Restore transaction rolled back because audit logging failed",
                                                    correlationId,
                                                    [auditErr.message]
                                                );
                                            });
                                        }

                                        db.commit((commitErr) => {

                                            if (commitErr) {

                                                return db.rollback(() => {

                                                    return errorResponse(
                                                        res,
                                                        500,
                                                        "TRANSACTION_ERROR",
                                                        "Restore transaction could not be committed",
                                                        correlationId,
                                                        [commitErr.message]
                                                    );
                                                });
                                            }

                                            return successResponse(
                                                res,
                                                201,
                                                {
                                                    restore_id:
                                                        restoreId,
                                                    commit_status:
                                                        "PENDING"
                                                },
                                                correlationId
                                            );
                                        });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        }
    );
});

// =====================================================
// GET RESTORE STATUS
// =====================================================

app.get("/restore/:id", (req, res) => {

    const restoreId = Number(req.params.id);

    if (!restoreId) {
        return errorResponse(
            res,
            400,
            "INVALID_RESTORE_ID",
            "Invalid restore ID",
            req.correlationId
        );
    }

    const sql = `
        SELECT
            rr.restore_id,
            rr.backup_id,
            rr.version_id,
            rr.user_id,
            u.name AS requested_by,
            rr.commit_status,
            rr.correlation_id,
            rr.requested_at,
            rr.completed_at
        FROM restore_requests rr
        INNER JOIN users u
            ON rr.user_id = u.user_id
        WHERE rr.restore_id = ?
    `;

    db.query(sql, [restoreId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch restore request",
                req.correlationId,
                [err.message]
            );
        }

        if (results.length === 0) {
            return errorResponse(
                res,
                404,
                "RESTORE_NOT_FOUND",
                "Restore request not found",
                req.correlationId
            );
        }

        return successResponse(
            res,
            200,
            results[0],
            req.correlationId
        );
    });
});

app.get("/api/v1/restores/:restoreId/download", async (req, res) => {
    const restoreId = Number(req.params.restoreId);
    if (!Number.isSafeInteger(restoreId) || restoreId < 1) return errorResponse(res, 400, "INVALID_RESTORE_ID", "Invalid restore ID", req.correlationId);
    try {
        const rows = await queryAsync("SELECT restored_object_key, commit_status FROM restore_requests WHERE restore_id=?", [restoreId]);
        if (!rows.length) return errorResponse(res, 404, "RESTORE_NOT_FOUND", "Restore request not found", req.correlationId);
        if (rows[0].commit_status !== "COMPLETED" || !rows[0].restored_object_key) return errorResponse(res, 409, "RESTORE_NOT_COMPLETED", "Restored file is not available", req.correlationId);
        const object = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: rows[0].restored_object_key }));
        const bytes = await objectToBuffer(object.Body);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", bytes.length);
        res.setHeader("Content-Disposition", `attachment; filename="restore-${restoreId}"`);
        return res.status(200).send(bytes);
    } catch (err) {
        if (err.code === "NoSuchKey" || err.name === "NoSuchKey" || err.name === "NotFound") return errorResponse(res, 404, "RESTORED_OBJECT_MISSING", "Restored file is unavailable in object storage", req.correlationId);
        return errorResponse(res, 502, "RESTORE_DOWNLOAD_FAILED", "Could not retrieve restored file", req.correlationId);
    }
});

// =====================================================
// RESTORE COMMIT HELPER
//
// Re-checks retention at the moment of commit.
// This protects against:
//
// Restore requested while ACTIVE
//              ↓
// Retention expires
//              ↓
// Restore commit attempted
//
// Result: RESTORE BLOCKED
// =====================================================

async function executeRestore(restoreId, req, res) {
    let restore;
    let outputKey;
    try {
        const rows = await queryAsync(
            `SELECT rr.restore_id, rr.backup_id, rr.version_id, rr.user_id, rr.commit_status,
                    rr.restored_object_key, rr.correlation_id, bj.file_id, bj.state AS backup_state, f.file_name,
                    f.source_path, fv.object_key AS version_object_key, fv.checksum,
                    fv.size_bytes, fv.state AS version_state, rp.duration_days,
                    DATEDIFF(CURDATE(), fv.created_at) AS age_days
             FROM restore_requests rr
             JOIN backup_jobs bj ON bj.backup_id = rr.backup_id
             JOIN files f ON f.file_id = bj.file_id
             JOIN file_versions fv ON fv.version_id = rr.version_id AND fv.file_id = f.file_id
             LEFT JOIN retention_policies rp ON rp.policy_id = f.policy_id
             WHERE rr.restore_id = ?`,
            [restoreId]
        );
        if (!rows.length) return errorResponse(res, 404, "RESTORE_NOT_FOUND", "Restore request or its version metadata was not found", req.correlationId);
        restore = rows[0];
        if (restore.backup_state !== "COMPLETED") return errorResponse(res, 409, "BACKUP_NOT_COMPLETED", "Restore requires a completed backup", req.correlationId);
        if (restore.commit_status === "COMPLETED" && restore.restored_object_key) {
            return successResponse(res, 200, { restore_id: restoreId, commit_status: "COMPLETED", download_path: `/api/v1/restores/${restoreId}/download` }, req.correlationId);
        }
        if (!["PENDING", "FAILED"].includes(restore.commit_status)) return errorResponse(res, 409, "RESTORE_IN_PROGRESS", "Restore is already being processed", req.correlationId);
        if (restore.version_state !== "COMMITTED") return errorResponse(res, 409, "VERSION_NOT_COMMITTED", "Only committed versions can be restored", req.correlationId);
        if (restore.duration_days == null || Number(restore.age_days) >= Number(restore.duration_days)) return errorResponse(res, 409, "RETENTION_EXPIRED", "Version retention has expired or no retention policy applies", req.correlationId);
        const updated = await queryAsync(
            `UPDATE restore_requests SET commit_status='RUNNING', error_message=NULL
             WHERE restore_id=? AND commit_status IN ('PENDING','FAILED')`,
            [restoreId]
        );
        if (!updated.affectedRows) return errorResponse(res, 409, "RESTORE_IN_PROGRESS", "Restore state changed before execution", req.correlationId);

        const sourceKey = restore.version_object_key || restore.source_path;
        if (!sourceKey || !restore.checksum || restore.size_bytes == null) throw Object.assign(new Error("Version has no verifiable stored object reference"), { code: "VERSION_OBJECT_UNAVAILABLE" });
        const sourceResponse = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: sourceKey }));
        const bytes = await objectToBuffer(sourceResponse.Body);
        const checksum = createHash("sha256").update(bytes).digest("hex");
        if (checksum !== String(restore.checksum).toLowerCase() || bytes.length !== Number(restore.size_bytes)) {
            throw Object.assign(new Error("Stored version content does not match authoritative checksum and size"), { code: "INTEGRITY_CHECK_FAILED" });
        }
        outputKey = `users/${restore.user_id}/restores/${restoreId}/${path.basename(restore.file_name)}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: MINIO_BUCKET,
            Key: outputKey,
            Body: bytes,
            ContentLength: bytes.length,
            ContentType: "application/octet-stream",
            Metadata: { sha256: checksum, sourceVersion: String(restore.version_id) }
        }));
        const verifyResponse = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: outputKey }));
        const restoredBytes = await objectToBuffer(verifyResponse.Body);
        if (restoredBytes.length !== bytes.length || createHash("sha256").update(restoredBytes).digest("hex") !== checksum) {
            await s3Client.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: outputKey })).catch(() => {});
            throw Object.assign(new Error("Restored object failed post-write verification"), { code: "RESTORE_VERIFY_FAILED" });
        }
        await transactionAsync(async () => {
            await queryAsync(
                `UPDATE restore_requests SET commit_status='COMPLETED', restored_object_key=?, error_message=NULL, completed_at=CURRENT_TIMESTAMP WHERE restore_id=? AND commit_status='RUNNING'`,
                [outputKey, restoreId]
            );
            await queryAsync(
                `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'RESTORE_COMPLETED', 'RESTORE_REQUESTS', ?, ?)`,
                [req.identity.userId, restoreId, req.correlationId]
            );
        });
        return successResponse(res, 200, { restore_id: restoreId, commit_status: "COMPLETED", download_path: `/api/v1/restores/${restoreId}/download`, file_name: restore.file_name, size_bytes: bytes.length, checksum }, req.correlationId);
    } catch (err) {
        const code = err.code || "RESTORE_EXECUTION_FAILED";
        if (outputKey) await s3Client.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: outputKey })).catch(() => {});
        try {
            await queryAsync("UPDATE restore_requests SET commit_status='FAILED', error_message=? WHERE restore_id=? AND commit_status='RUNNING'", [code, restoreId]);
            if (restore) await queryAsync(
                `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, correlation_id) VALUES (?, 'RESTORE_FAILED', 'RESTORE_REQUESTS', ?, ?)`,
                [req.identity.userId, restoreId, req.correlationId]
            );
        } catch { /* Keep the request failed closed if persistence also fails. */ }
        const status = code === "NoSuchKey" || code === "NotFound" ? 404 : code === "VERSION_OBJECT_UNAVAILABLE" || code === "INTEGRITY_CHECK_FAILED" ? 409 : 502;
        return errorResponse(res, status, code, "Restore could not be verified and completed", req.correlationId);
    }
}

function commitRestore(restoreId, req, res) {

    return executeRestore(restoreId, req, res);

    const correlationId = req.correlationId;

    const getSql = `
        SELECT
            rr.restore_id,
            rr.backup_id,
            rr.version_id,
            rr.user_id,
            rr.commit_status,
            rr.correlation_id,
            bj.file_id
        FROM restore_requests rr
        INNER JOIN backup_jobs bj
            ON rr.backup_id = bj.backup_id
        WHERE rr.restore_id = ?
    `;

    db.query(
        getSql,
        [restoreId],
        (err, results) => {

            if (err) {
                return errorResponse(
                    res,
                    500,
                    "DATABASE_ERROR",
                    "Failed to check restore request",
                    correlationId,
                    [err.message]
                );
            }

            if (results.length === 0) {
                return errorResponse(
                    res,
                    404,
                    "RESTORE_NOT_FOUND",
                    "Restore request not found",
                    correlationId
                );
            }

            const restore = results[0];

            if (restore.commit_status !== "PENDING") {
                return errorResponse(
                    res,
                    409,
                    "RESOURCE_CONFLICT",
                    "Restore cannot be completed",
                    correlationId,
                    [
                        {
                            current_status:
                                restore.commit_status
                        }
                    ]
                );
            }

            db.beginTransaction((transactionErr) => {

                if (transactionErr) {
                    return errorResponse(
                        res,
                        500,
                        "TRANSACTION_ERROR",
                        "Failed to start restore transaction",
                        correlationId,
                        [transactionErr.message]
                    );
                }

                // -------------------------------------------------
                // RE-CHECK RETENTION INSIDE TRANSACTION
                // -------------------------------------------------

                const retentionSql = `
                    SELECT
                        fv.version_id,
                        fv.created_at,
                        fv.state,
                        rp.policy_name,
                        rp.duration_days,
                        DATEDIFF(CURDATE(), fv.created_at) AS age_days
                    FROM file_versions fv
                    INNER JOIN files f
                        ON fv.file_id = f.file_id
                    INNER JOIN retention_policies rp
                        ON f.policy_id = rp.policy_id
                    WHERE fv.version_id = ?
                    AND fv.file_id = ?
                `;

                db.query(
                    retentionSql,
                    [
                        restore.version_id,
                        restore.file_id
                    ],
                    (retentionErr, retentionResults) => {

                        if (retentionErr) {

                            return db.rollback(() => {

                                return errorResponse(
                                    res,
                                    500,
                                    "DATABASE_ERROR",
                                    "Failed to re-check retention policy",
                                    correlationId,
                                    [retentionErr.message]
                                );
                            });
                        }

                        if (retentionResults.length === 0) {

                            return db.rollback(() => {

                                return errorResponse(
                                    res,
                                    404,
                                    "VERSION_NOT_FOUND",
                                    "Version retention information not found",
                                    correlationId
                                );
                            });
                        }

                        const retention =
                            retentionResults[0];

                        if (
                            Number(retention.age_days) >=
                            Number(retention.duration_days)
                        ) {

                            return db.rollback(() => {

                                return errorResponse(
                                    res,
                                    409,
                                    "RETENTION_EXPIRED",
                                    "Restore cannot be committed because the file version has exceeded its retention period",
                                    correlationId,
                                    [
                                        {
                                            version_id:
                                                retention.version_id,
                                            policy_name:
                                                retention.policy_name,
                                            duration_days:
                                                retention.duration_days,
                                            age_days:
                                                retention.age_days
                                        }
                                    ]
                                );
                            });
                        }

                        // -------------------------------------------------
                        // COMPLETE RESTORE
                        // -------------------------------------------------

                        const updateSql = `
                            UPDATE restore_requests
                            SET
                                commit_status = 'COMPLETED',
                                completed_at = CURRENT_TIMESTAMP
                            WHERE restore_id = ?
                            AND commit_status = 'PENDING'
                        `;

                        db.query(
                            updateSql,
                            [restoreId],
                            (updateErr, result) => {

                                if (updateErr) {

                                    return db.rollback(() => {

                                        return errorResponse(
                                            res,
                                            500,
                                            "DATABASE_ERROR",
                                            "Failed to complete restore",
                                            correlationId,
                                            [updateErr.message]
                                        );
                                    });
                                }

                                if (result.affectedRows === 0) {

                                    return db.rollback(() => {

                                        return errorResponse(
                                            res,
                                            409,
                                            "RESOURCE_CONFLICT",
                                            "Restore state changed before completion",
                                            correlationId
                                        );
                                    });
                                }

                                // -------------------------------------------------
                                // AUDIT
                                // -------------------------------------------------

                                const auditSql = `
                                    INSERT INTO audit_log
                                    (
                                        actor_id,
                                        action,
                                        entity_type,
                                        entity_id,
                                        correlation_id
                                    )
                                    VALUES
                                    (
                                        ?,
                                        'STATE_CHANGE_TO_COMPLETED',
                                        'RESTORE_REQUESTS',
                                        ?,
                                        ?
                                    )
                                `;

                                db.query(
                                    auditSql,
                                    [
                                        restore.user_id,
                                        restoreId,
                                        restore.correlation_id
                                    ],
                                    (auditErr) => {

                                        if (auditErr) {

                                            return db.rollback(() => {

                                                return errorResponse(
                                                    res,
                                                    500,
                                                    "AUDIT_ERROR",
                                                    "Restore completion rolled back because audit logging failed",
                                                    correlationId,
                                                    [auditErr.message]
                                                );
                                            });
                                        }

                                        // -------------------------------------------------
                                        // COMMIT
                                        // -------------------------------------------------

                                        db.commit((commitErr) => {

                                            if (commitErr) {

                                                return db.rollback(() => {

                                                    return errorResponse(
                                                        res,
                                                        500,
                                                        "TRANSACTION_ERROR",
                                                        "Restore transaction could not be committed",
                                                        correlationId,
                                                        [commitErr.message]
                                                    );
                                                });
                                            }

                                            return successResponse(
                                                res,
                                                200,
                                                {
                                                    restore_id:
                                                        restoreId,
                                                    commit_status:
                                                        "COMPLETED"
                                                },
                                                correlationId
                                            );
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
}

// =====================================================
// RESTORE COMMIT
// Official:
// POST /internal/v1/restores/commit
// =====================================================

app.post("/internal/v1/restores/commit", (req, res) => {

    const restoreId = Number(req.body.restore_id);

    if (!req.body.restore_id) {
        return errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "restore_id is required",
            req.correlationId
        );
    }

    if (!restoreId) {
        return errorResponse(
            res,
            400,
            "INVALID_RESTORE_ID",
            "Invalid restore ID",
            req.correlationId
        );
    }

    return commitRestore(
        restoreId,
        req,
        res
    );
});

// =====================================================
// RESTORE COMPLETE
// Compatibility route
// Uses the same transactional logic.
// =====================================================

app.post("/restore/:id/complete", (req, res) => {

    const restoreId = Number(req.params.id);

    if (!restoreId) {
        return errorResponse(
            res,
            400,
            "INVALID_RESTORE_ID",
            "Invalid restore ID",
            req.correlationId
        );
    }

    return commitRestore(
        restoreId,
        req,
        res
    );
});

// =====================================================
// GET AUDIT LOG
// Official: GET /api/v1/audit
// =====================================================

app.get("/api/v1/audit", (req, res) => {

    const {
        actor_id,
        entity_type,
        entity_id,
        correlation_id
    } = req.query;

    let sql = `
        SELECT
            audit_id,
            actor_id,
            action,
            entity_type,
            entity_id,
            correlation_id,
            created_at
        FROM audit_log
        WHERE 1 = 1
    `;

    const params = [];

    if (actor_id) {
        sql += ` AND actor_id = ?`;
        params.push(actor_id);
    }

    if (entity_type) {
        sql += ` AND entity_type = ?`;
        params.push(entity_type);
    }

    if (entity_id) {
        sql += ` AND entity_id = ?`;
        params.push(entity_id);
    }

    if (correlation_id) {
        sql += ` AND correlation_id = ?`;
        params.push(correlation_id);
    }

    sql += `
        ORDER BY created_at DESC
        LIMIT 100
    `;

    db.query(sql, params, (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to fetch audit logs",
                req.correlationId,
                [err.message]
            );
        }

        return successResponse(
            res,
            200,
            results,
            req.correlationId
        );
    });
});

// =====================================================
// STORAGE REPORT
// Official: GET /api/v1/reports/storage
// =====================================================

app.get("/api/v1/reports/storage", (req, res) => {

    const sql = `
        SELECT
            sl.location_id,
            sl.path,
            sl.capacity_gb,
            COALESCE(SUM(
                CASE
                    WHEN fv.version_id = latest.latest_version_id
                    THEN fv.size_bytes
                    ELSE 0
                END
            ), 0) AS used_bytes
        FROM storage_locations sl

        LEFT JOIN files f
            ON f.location_id = sl.location_id

        LEFT JOIN (
            SELECT
                file_id,
                MAX(version_id) AS latest_version_id
            FROM file_versions
            GROUP BY file_id
        ) latest
            ON latest.file_id = f.file_id

        LEFT JOIN file_versions fv
            ON fv.version_id = latest.latest_version_id

        GROUP BY
            sl.location_id,
            sl.path,
            sl.capacity_gb

        ORDER BY sl.location_id
    `;

    db.query(sql, (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to generate storage report",
                req.correlationId,
                [err.message]
            );
        }

        const report = results.map((row) => {

            const capacityGB =
                Number(row.capacity_gb) || 0;

            const usedBytes =
                Number(row.used_bytes) || 0;

            const capacityBytes =
                capacityGB *
                1024 *
                1024 *
                1024;

            const availableBytes =
                Math.max(
                    capacityBytes - usedBytes,
                    0
                );

            const utilizationPercent =
                capacityBytes > 0
                    ? Number(
                        (
                            (usedBytes /
                                capacityBytes) *
                            100
                        ).toFixed(2)
                    )
                    : 0;

            return {
                location_id: row.location_id,
                path: row.path,
                capacity_gb: capacityGB,
                used_bytes: usedBytes,
                available_bytes: availableBytes,
                utilization_percent:
                    utilizationPercent
            };
        });

        return successResponse(
            res,
            200,
            report,
            req.correlationId
        );
    });
});

// =====================================================
// LEGACY ROUTES
// Kept so previous tests do not break.
// =====================================================

// -----------------------------------------------------
// GET /files
// -----------------------------------------------------

app.get("/files", (req, res) => {

    const sql = `
        SELECT
            file_id,
            user_id,
            location_id,
            policy_id,
            file_name,
            source_path,
            source_path AS object_key,
            created_at
        FROM files
        WHERE user_id = ?
        ORDER BY file_id
    `;

    db.query(sql, [req.identity.userId], (err, results) => {

        if (err) {
            return res.status(500).json({
                message: "Failed to fetch files",
                error: err.message
            });
        }

        return res.status(200).json({
            message: "Files fetched successfully",
            data: results
        });
    });
});

// -----------------------------------------------------
// GET /backup/:id
// -----------------------------------------------------

app.get("/backup/:id", (req, res) => {

    const backupId = Number(req.params.id);

    const sql = `
        SELECT
            bj.backup_id,
            bj.user_id,
            u.name AS requested_by,
            bj.file_id,
            f.file_name,
            bj.version_id,
            bj.backup_type,
            bj.state,
            bj.correlation_id,
            bj.created_at,
            bj.committed_at
        FROM backup_jobs bj
        INNER JOIN users u
            ON bj.user_id = u.user_id
        INNER JOIN files f
            ON bj.file_id = f.file_id
        WHERE bj.backup_id = ?
    `;

    db.query(sql, [backupId], (err, results) => {

        if (err) {
            return res.status(500).json({
                message: "Failed to fetch backup",
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                message: "Backup not found"
            });
        }

        return res.status(200).json({
            message: "Backup fetched successfully",
            data: results[0]
        });
    });
});

// =====================================================
// START SERVER
// =====================================================

if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = { app, db, s3Client };
