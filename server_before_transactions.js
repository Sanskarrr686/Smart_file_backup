const express = require("express");
const mysql = require("mysql2");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());

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

app.get("/api/v1/files", (req, res) => {

    const sql = `
        SELECT
            file_id,
            user_id,
            location_id,
            policy_id,
            file_name,
            source_path,
            created_at
        FROM files
        ORDER BY file_id
    `;

    db.query(sql, (err, results) => {

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

app.post("/api/v1/files", (req, res) => {

    const {
        user_id,
        location_id,
        policy_id,
        file_name,
        source_path
    } = req.body;

    if (!user_id || !file_name || !source_path) {
        return errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "user_id, file_name and source_path are required",
            req.correlationId
        );
    }

    const sql = `
        INSERT INTO files
        (
            user_id,
            location_id,
            policy_id,
            file_name,
            source_path
        )
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            user_id,
            location_id || null,
            policy_id || null,
            file_name,
            source_path
        ],
        (err, result) => {

            if (err) {
                return errorResponse(
                    res,
                    500,
                    "DATABASE_ERROR",
                    "Failed to create file",
                    req.correlationId,
                    [err.message]
                );
            }

            return successResponse(
                res,
                201,
                {
                    file_id: result.insertId
                },
                req.correlationId
            );
        }
    );
});

// =====================================================
// UPDATE FILE
// Official: PATCH /api/v1/files/:fileId
// =====================================================

app.patch("/api/v1/files/:fileId", (req, res) => {

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
        source_path,
        location_id,
        policy_id
    } = req.body;

    const sql = `
        UPDATE files
        SET
            file_name = COALESCE(?, file_name),
            source_path = COALESCE(?, source_path),
            location_id = COALESCE(?, location_id),
            policy_id = COALESCE(?, policy_id)
        WHERE file_id = ?
    `;

    db.query(
        sql,
        [
            file_name || null,
            source_path || null,
            location_id || null,
            policy_id || null,
            fileId
        ],
        (err, result) => {

            if (err) {
                return errorResponse(
                    res,
                    500,
                    "DATABASE_ERROR",
                    "Failed to update file",
                    req.correlationId,
                    [err.message]
                );
            }

            if (result.affectedRows === 0) {
                return errorResponse(
                    res,
                    404,
                    "FILE_NOT_FOUND",
                    "File not found",
                    req.correlationId
                );
            }

            return successResponse(
                res,
                200,
                {
                    file_id: fileId
                },
                req.correlationId
            );
        }
    );
});

// =====================================================
// DELETE FILE
// Compatibility API
// =====================================================

app.delete("/api/v1/files/:fileId", (req, res) => {

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

    db.query(sql, [fileId], (err, result) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to delete file",
                req.correlationId,
                [err.message]
            );
        }

        if (result.affectedRows === 0) {
            return errorResponse(
                res,
                404,
                "FILE_NOT_FOUND",
                "File not found",
                req.correlationId
            );
        }

        return successResponse(
            res,
            200,
            {
                file_id: fileId
            },
            req.correlationId
        );
    });
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
        ORDER BY version_number DESC
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
// GET VERSION CHUNKS
// Team C READS Team B metadata
// Official: GET /api/v1/versions/:versionId/chunks
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
            vc.sequence_no,
            c.chunk_hash,
            c.chunk_size,
            c.storage_ref
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
// =====================================================
// CREATE BACKUP
// Official: POST /api/v1/backups
// ACID TRANSACTION VERSION
// =====================================================

app.post("/api/v1/backups", (req, res) => {

    const {
        user_id,
        file_id,
        version_id,
        backup_type,
        idempotency_key
    } = req.body;

    const correlationId = req.correlationId;

    if (
        !user_id ||
        !file_id ||
        !version_id ||
        !backup_type ||
        !idempotency_key
    ) {
        return errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "user_id, file_id, version_id, backup_type and idempotency_key are required",
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
        [idempotency_key],
        (err, duplicateResults) => {

            if (err) {
                return errorResponse(
                    res,
                    500,
                    "DATABASE_ERROR",
                    "Failed to check duplicate backup",
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
                            state: duplicateResults[0].state
                        }
                    ]
                );
            }

            // -------------------------------------------------
            // CHECK FILE
            // -------------------------------------------------

            const fileSql = `
                SELECT file_id
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
                        SELECT version_id
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

                            db.beginTransaction((err) => {

                                if (err) {
                                    return errorResponse(
                                        res,
                                        500,
                                        "TRANSACTION_ERROR",
                                        "Failed to start database transaction",
                                        correlationId,
                                        [err.message]
                                    );
                                }

                                // -------------------------------------------------
                                // INSERT BACKUP
                                // -------------------------------------------------

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
                                    VALUES (?, ?, ?, ?, ?, 'REQUESTED', ?)
                                `;

                                db.query(
                                    insertSql,
                                    [
                                        user_id,
                                        file_id,
                                        version_id,
                                        backup_type,
                                        idempotency_key,
                                        correlationId
                                    ],
                                    (err, result) => {

                                        if (err) {

                                            return db.rollback(() => {

                                                if (err.code === "ER_DUP_ENTRY") {
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
                                                    [err.message]
                                                );
                                            });
                                        }

                                        const backupId = result.insertId;

                                        // -------------------------------------------------
                                        // AUDIT LOG
                                        // SAME TRANSACTION
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
                                                'BACKUP_JOBS',
                                                ?,
                                                ?
                                            )
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
                                                            "Backup creation was rolled back because audit logging failed",
                                                            correlationId,
                                                            [auditErr.message]
                                                        );

                                                    });
                                                }

                                                // -------------------------------------------------
                                                // COMMIT TRANSACTION
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

                                                    return successResponse(
                                                        res,
                                                        201,
                                                        {
                                                            backup_id: backupId,
                                                            state: "REQUESTED"
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

// =====================================================
// COMPLETE BACKUP
// Internal helper API
// =====================================================

app.post("/api/v1/backups/:backupId/complete", (req, res) => {

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
            (err, result) => {

                if (err) {
                    return errorResponse(
                        res,
                        500,
                        "DATABASE_ERROR",
                        "Failed to complete backup",
                        req.correlationId,
                        [err.message]
                    );
                }

                if (result.affectedRows === 0) {
                    return errorResponse(
                        res,
                        409,
                        "RESOURCE_CONFLICT",
                        "Backup state changed before completion",
                        req.correlationId
                    );
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
                        backup.user_id,
                        backupId,
                        backup.correlation_id
                    ],
                    (auditErr) => {

                        if (auditErr) {
                            console.error(
                                "Backup completion audit error:",
                                auditErr.message
                            );
                        }

                        return successResponse(
                            res,
                            200,
                            {
                                backup_id: backupId,
                                state: "COMPLETED"
                            },
                            req.correlationId
                        );
                    }
                );
            }
        );
    });
});

// =====================================================
// CANCEL BACKUP
// Official: POST /api/v1/backups/:backupId/cancel
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

        const updateSql = `
            UPDATE backup_jobs
            SET state = 'CANCELLED'
            WHERE backup_id = ?
            AND state = 'REQUESTED'
        `;

        db.query(
            updateSql,
            [backupId],
            (err, result) => {

                if (err) {
                    return errorResponse(
                        res,
                        500,
                        "DATABASE_ERROR",
                        "Failed to cancel backup",
                        req.correlationId,
                        [err.message]
                    );
                }

                if (result.affectedRows === 0) {
                    return errorResponse(
                        res,
                        409,
                        "RESOURCE_CONFLICT",
                        "Backup state changed before cancellation",
                        req.correlationId
                    );
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
                        backup.user_id,
                        backupId,
                        backup.correlation_id
                    ],
                    (auditErr) => {

                        if (auditErr) {
                            console.error(
                                "Backup cancellation audit error:",
                                auditErr.message
                            );
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
                    }
                );
            }
        );
    });
});

// =====================================================
// CREATE RESTORE REQUEST
// =====================================================

// Compatibility route + current development API
app.post("/restore", (req, res) => {

    const {
        backup_id,
        version_id,
        user_id
    } = req.body;

    const correlationId = req.correlationId;

    if (
        !backup_id ||
        !version_id ||
        !user_id
    ) {
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
                (err, result) => {

                    if (err) {
                        return errorResponse(
                            res,
                            500,
                            "DATABASE_ERROR",
                            "Failed to create restore request",
                            correlationId,
                            [err.message]
                        );
                    }

                    const restoreId = result.insertId;

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
                                console.error(
                                    "Restore audit error:",
                                    auditErr.message
                                );
                            }

                            return successResponse(
                                res,
                                201,
                                {
                                    restore_id: restoreId,
                                    commit_status: "PENDING"
                                },
                                correlationId
                            );
                        }
                    );
                }
            );
        }
    );
});

// =====================================================
// GET RESTORE STATUS
// Compatibility API
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

// =====================================================
// RESTORE COMMIT
// Official: POST /internal/v1/restores/commit
// =====================================================

app.post("/internal/v1/restores/commit", (req, res) => {

    const {
        restore_id
    } = req.body;

    if (!restore_id) {
        return errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "restore_id is required",
            req.correlationId
        );
    }

    const restoreId = Number(restore_id);

    if (!restoreId) {
        return errorResponse(
            res,
            400,
            "INVALID_RESTORE_ID",
            "Invalid restore ID",
            req.correlationId
        );
    }

    const getSql = `
        SELECT
            user_id,
            correlation_id,
            commit_status
        FROM restore_requests
        WHERE restore_id = ?
    `;

    db.query(getSql, [restoreId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to check restore request",
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

        const restore = results[0];

        if (restore.commit_status !== "PENDING") {
            return errorResponse(
                res,
                409,
                "RESOURCE_CONFLICT",
                "Restore cannot be completed",
                req.correlationId,
                [
                    {
                        current_status: restore.commit_status
                    }
                ]
            );
        }

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
            (err, result) => {

                if (err) {
                    return errorResponse(
                        res,
                        500,
                        "DATABASE_ERROR",
                        "Failed to complete restore",
                        req.correlationId,
                        [err.message]
                    );
                }

                if (result.affectedRows === 0) {
                    return errorResponse(
                        res,
                        409,
                        "RESOURCE_CONFLICT",
                        "Restore state changed before completion",
                        req.correlationId
                    );
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
                            console.error(
                                "Restore completion audit error:",
                                auditErr.message
                            );
                        }

                        return successResponse(
                            res,
                            200,
                            {
                                restore_id: restoreId,
                                commit_status: "COMPLETED"
                            },
                            req.correlationId
                        );
                    }
                );
            }
        );
    });
});

// =====================================================
// OLD RESTORE COMPLETE ROUTE
// Kept so previous testing continues to work
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

    const getSql = `
        SELECT
            user_id,
            correlation_id,
            commit_status
        FROM restore_requests
        WHERE restore_id = ?
    `;

    db.query(getSql, [restoreId], (err, results) => {

        if (err) {
            return errorResponse(
                res,
                500,
                "DATABASE_ERROR",
                "Failed to check restore request",
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

        const restore = results[0];

        if (restore.commit_status !== "PENDING") {
            return errorResponse(
                res,
                409,
                "RESOURCE_CONFLICT",
                "Restore cannot be completed",
                req.correlationId
            );
        }

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
            (err, result) => {

                if (err) {
                    return errorResponse(
                        res,
                        500,
                        "DATABASE_ERROR",
                        "Failed to complete restore",
                        req.correlationId,
                        [err.message]
                    );
                }

                if (result.affectedRows === 0) {
                    return errorResponse(
                        res,
                        409,
                        "RESOURCE_CONFLICT",
                        "Restore state changed before completion",
                        req.correlationId
                    );
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
                    () => {

                        return successResponse(
                            res,
                            200,
                            {
                                restore_id: restoreId,
                                commit_status: "COMPLETED"
                            },
                            req.correlationId
                        );
                    }
                );
            }
        );
    });
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

            const capacityGB = Number(row.capacity_gb) || 0;
            const usedBytes = Number(row.used_bytes) || 0;

            const capacityBytes =
                capacityGB * 1024 * 1024 * 1024;

            const availableBytes =
                Math.max(capacityBytes - usedBytes, 0);

            const utilizationPercent =
                capacityBytes > 0
                    ? Number(
                        ((usedBytes / capacityBytes) * 100)
                            .toFixed(2)
                    )
                    : 0;

            return {
                location_id: row.location_id,
                path: row.path,
                capacity_gb: capacityGB,
                used_bytes: usedBytes,
                available_bytes: availableBytes,
                utilization_percent: utilizationPercent
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
// These are kept temporarily so previous testing doesn't
// suddenly stop working.
// =====================================================

// GET /files
app.get("/files", (req, res) => {

    const sql = `
        SELECT
            file_id,
            user_id,
            location_id,
            policy_id,
            file_name,
            source_path,
            created_at
        FROM files
        ORDER BY file_id
    `;

    db.query(sql, (err, results) => {

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

// GET /backup/:id
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

app.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );
});