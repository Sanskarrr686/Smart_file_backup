const express = require("express");
const mysql = require("mysql2");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// ===============================
// MySQL Connection
// ===============================
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

// ===============================
// HOME
// ===============================
app.get("/", (req, res) => {
    res.status(200).json({
        message: "Smart File Backup System Backend is running!"
    });
});

// ===============================
// GET ALL FILES
// ===============================
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
            console.error(err);

            return res.status(500).json({
                message: "Failed to fetch files",
                error: err.message
            });
        }

        res.status(200).json({
            message: "Files fetched successfully",
            data: results
        });
    });
});

// ===============================
// CREATE FILE
// ===============================
app.post("/files", (req, res) => {

    const {
        user_id,
        location_id,
        policy_id,
        file_name,
        source_path
    } = req.body;

    if (!user_id || !file_name || !source_path) {

        return res.status(400).json({
            message: "user_id, file_name and source_path are required"
        });
    }

    const sql = `
        INSERT INTO files
        (user_id, location_id, policy_id, file_name, source_path)
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
                console.error(err);

                return res.status(500).json({
                    message: "Failed to create file",
                    error: err.message
                });
            }

            res.status(201).json({
                message: "File created successfully",
                data: {
                    file_id: result.insertId
                }
            });
        }
    );
});

// ===============================
// UPDATE FILE
// ===============================
app.put("/files/:id", (req, res) => {

    const fileId = Number(req.params.id);

    const {
        file_name,
        source_path,
        location_id,
        policy_id
    } = req.body;

    if (!fileId) {

        return res.status(400).json({
            message: "Invalid file ID"
        });
    }

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

                return res.status(500).json({
                    message: "Failed to update file",
                    error: err.message
                });
            }

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    message: "File not found"
                });
            }

            res.status(200).json({
                message: "File updated successfully",
                data: {
                    file_id: fileId
                }
            });
        }
    );
});

// ===============================
// DELETE FILE
// ===============================
app.delete("/files/:id", (req, res) => {

    const fileId = Number(req.params.id);

    if (!fileId) {

        return res.status(400).json({
            message: "Invalid file ID"
        });
    }

    const sql = `
        DELETE FROM files
        WHERE file_id = ?
    `;

    db.query(sql, [fileId], (err, result) => {

        if (err) {

            return res.status(500).json({
                message: "Failed to delete file",
                error: err.message
            });
        }

        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "File not found"
            });
        }

        res.status(200).json({
            message: "File deleted successfully",
            data: {
                file_id: fileId
            }
        });
    });
});

// ===============================
// GET FILE VERSIONS
// ===============================
app.get("/files/:id/versions", (req, res) => {

    const fileId = Number(req.params.id);

    if (!fileId) {

        return res.status(400).json({
            message: "Invalid file ID"
        });
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

            return res.status(500).json({
                message: "Failed to fetch file versions",
                error: err.message
            });
        }

        res.status(200).json({
            message: "File versions fetched successfully",
            data: results
        });
    });
});

// ===============================
// GET VERSION CHUNKS
// ===============================
app.get("/versions/:version_id/chunks", (req, res) => {

    const versionId = Number(req.params.version_id);

    if (!versionId) {

        return res.status(400).json({
            message: "Invalid version ID"
        });
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

            return res.status(500).json({
                message: "Failed to fetch version chunks",
                error: err.message
            });
        }

        res.status(200).json({
            message: "Chunks fetched successfully",
            data: results
        });
    });
});

// ===============================
// CREATE BACKUP
// ===============================
app.post("/backup", (req, res) => {

    const {
        user_id,
        file_id,
        version_id,
        backup_type,
        idempotency_key,
        correlation_id
    } = req.body;

    if (
        !user_id ||
        !file_id ||
        !version_id ||
        !backup_type ||
        !idempotency_key ||
        !correlation_id
    ) {

        return res.status(400).json({
            message: "All backup fields are required"
        });
    }

    // Check duplicate idempotency key
    const duplicateSql = `
        SELECT
            backup_id,
            state
        FROM backup_jobs
        WHERE idempotency_key = ?
    `;

    db.query(
        duplicateSql,
        [idempotency_key],
        (err, duplicateResults) => {

            if (err) {

                return res.status(500).json({
                    message: "Failed to check duplicate backup",
                    error: err.message
                });
            }

            if (duplicateResults.length > 0) {

                return res.status(409).json({
                    message: "Backup request already exists",
                    data: {
                        backup_id: duplicateResults[0].backup_id,
                        state: duplicateResults[0].state
                    }
                });
            }

            // Check file exists
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

                        return res.status(500).json({
                            message: "Failed to validate file",
                            error: err.message
                        });
                    }

                    if (fileResults.length === 0) {

                        return res.status(404).json({
                            message: "File not found"
                        });
                    }

                    // Check version belongs to file
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

                                return res.status(500).json({
                                    message: "Failed to validate file version",
                                    error: err.message
                                });
                            }

                            if (versionResults.length === 0) {

                                return res.status(400).json({
                                    message: "Version does not belong to the specified file"
                                });
                            }

                            // Create backup
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
                                    correlation_id
                                ],
                                (err, result) => {

                                    if (err) {

                                        if (err.code === "ER_DUP_ENTRY") {

                                            return res.status(409).json({
                                                message: "Backup request already exists"
                                            });
                                        }

                                        return res.status(500).json({
                                            message: "Failed to create backup",
                                            error: err.message
                                        });
                                    }

                                    const backupId = result.insertId;

                                    // Audit log
                                    const auditSql = `
                                        INSERT INTO audit_log
                                        (
                                            actor_id,
                                            action,
                                            entity_type,
                                            entity_id,
                                            correlation_id
                                        )
                                        VALUES (?, 'CREATE', 'BACKUP_JOBS', ?, ?)
                                    `;

                                    db.query(
                                        auditSql,
                                        [
                                            user_id,
                                            backupId,
                                            correlation_id
                                        ],
                                        (auditErr) => {

                                            if (auditErr) {
                                                console.error(
                                                    "Backup audit log error:",
                                                    auditErr.message
                                                );
                                            }

                                            res.status(201).json({
                                                message: "Backup job created successfully",
                                                data: {
                                                    backup_id: backupId,
                                                    state: "REQUESTED"
                                                }
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// ===============================
// GET BACKUP STATUS
// ===============================
app.get("/backup/:id", (req, res) => {

    const backupId = Number(req.params.id);

    if (!backupId) {

        return res.status(400).json({
            message: "Invalid backup ID"
        });
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

        res.status(200).json({
            message: "Backup fetched successfully",
            data: results[0]
        });
    });
});

// ===============================
// COMPLETE BACKUP
// ===============================
app.post("/backup/:id/complete", (req, res) => {

    const backupId = Number(req.params.id);

    if (!backupId) {

        return res.status(400).json({
            message: "Invalid backup ID"
        });
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

            return res.status(500).json({
                message: "Failed to check backup",
                error: err.message
            });
        }

        if (results.length === 0) {

            return res.status(404).json({
                message: "Backup not found"
            });
        }

        const backup = results[0];

        if (backup.state !== "REQUESTED") {

            return res.status(409).json({
                message: "Backup cannot be completed",
                data: {
                    current_state: backup.state
                }
            });
        }

        const updateSql = `
            UPDATE backup_jobs
            SET
                state = 'COMPLETED',
                committed_at = CURRENT_TIMESTAMP
            WHERE backup_id = ?
            AND state = 'REQUESTED'
        `;

        db.query(updateSql, [backupId], (err, result) => {

            if (err) {

                return res.status(500).json({
                    message: "Failed to complete backup",
                    error: err.message
                });
            }

            if (result.affectedRows === 0) {

                return res.status(409).json({
                    message: "Backup state changed before completion"
                });
            }

            // Audit log
            const auditSql = `
                INSERT INTO audit_log
                (
                    actor_id,
                    action,
                    entity_type,
                    entity_id,
                    correlation_id
                )
                VALUES (?, 'STATE_CHANGE_TO_COMPLETED', 'BACKUP_JOBS', ?, ?)
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

                    res.status(200).json({
                        message: "Backup completed successfully",
                        data: {
                            backup_id: backupId,
                            state: "COMPLETED"
                        }
                    });
                }
            );
        });
    });
});

// ===============================
// CREATE RESTORE REQUEST
// ===============================
app.post("/restore", (req, res) => {

    const {
        backup_id,
        version_id,
        user_id,
        correlation_id
    } = req.body;

    if (
        !backup_id ||
        !version_id ||
        !user_id ||
        !correlation_id
    ) {

        return res.status(400).json({
            message: "All restore fields are required"
        });
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

                return res.status(500).json({
                    message: "Failed to validate backup",
                    error: err.message
                });
            }

            if (backupResults.length === 0) {

                return res.status(404).json({
                    message: "Backup not found"
                });
            }

            const backup = backupResults[0];

            if (backup.state !== "COMPLETED") {

                return res.status(400).json({
                    message: "Backup must be COMPLETED before restore"
                });
            }

            if (Number(backup.version_id) !== Number(version_id)) {

                return res.status(400).json({
                    message: "Restore version does not match backup version"
                });
            }

            if (Number(backup.user_id) !== Number(user_id)) {

                return res.status(403).json({
                    message: "User does not own this backup"
                });
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
                VALUES (?, ?, ?, 'PENDING', ?)
            `;

            db.query(
                insertSql,
                [
                    backup_id,
                    version_id,
                    user_id,
                    correlation_id
                ],
                (err, result) => {

                    if (err) {

                        return res.status(500).json({
                            message: "Failed to create restore request",
                            error: err.message
                        });
                    }

                    const restoreId = result.insertId;

                    // Restore audit log
                    const auditSql = `
                        INSERT INTO audit_log
                        (
                            actor_id,
                            action,
                            entity_type,
                            entity_id,
                            correlation_id
                        )
                        VALUES (?, 'CREATE', 'RESTORE_REQUESTS', ?, ?)
                    `;

                    db.query(
                        auditSql,
                        [
                            user_id,
                            restoreId,
                            correlation_id
                        ],
                        (auditErr) => {

                            if (auditErr) {
                                console.error(
                                    "Restore audit error:",
                                    auditErr.message
                                );
                            }

                            res.status(201).json({
                                message: "Restore request created successfully",
                                data: {
                                    restore_id: restoreId,
                                    commit_status: "PENDING"
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// ===============================
// GET RESTORE STATUS
// ===============================
app.get("/restore/:id", (req, res) => {

    const restoreId = Number(req.params.id);

    if (!restoreId) {

        return res.status(400).json({
            message: "Invalid restore ID"
        });
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

            return res.status(500).json({
                message: "Failed to fetch restore request",
                error: err.message
            });
        }

        if (results.length === 0) {

            return res.status(404).json({
                message: "Restore request not found"
            });
        }

        res.status(200).json({
            message: "Restore request fetched successfully",
            data: results[0]
        });
    });
});

// ===============================
// COMPLETE RESTORE
// ===============================
app.post("/restore/:id/complete", (req, res) => {

    const restoreId = Number(req.params.id);

    if (!restoreId) {

        return res.status(400).json({
            message: "Invalid restore ID"
        });
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

            return res.status(500).json({
                message: "Failed to check restore request",
                error: err.message
            });
        }

        if (results.length === 0) {

            return res.status(404).json({
                message: "Restore request not found"
            });
        }

        const restore = results[0];

        if (restore.commit_status !== "PENDING") {

            return res.status(409).json({
                message: "Restore cannot be completed",
                data: {
                    current_status: restore.commit_status
                }
            });
        }

        const updateSql = `
            UPDATE restore_requests
            SET
                commit_status = 'COMPLETED',
                completed_at = CURRENT_TIMESTAMP
            WHERE restore_id = ?
            AND commit_status = 'PENDING'
        `;

        db.query(updateSql, [restoreId], (err, result) => {

            if (err) {

                return res.status(500).json({
                    message: "Failed to complete restore",
                    error: err.message
                });
            }

            if (result.affectedRows === 0) {

                return res.status(409).json({
                    message: "Restore state changed before completion"
                });
            }

            // Audit log
            const auditSql = `
                INSERT INTO audit_log
                (
                    actor_id,
                    action,
                    entity_type,
                    entity_id,
                    correlation_id
                )
                VALUES (?, 'STATE_CHANGE_TO_COMPLETED', 'RESTORE_REQUESTS', ?, ?)
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

                    res.status(200).json({
                        message: "Restore completed successfully",
                        data: {
                            restore_id: restoreId,
                            status: "COMPLETED"
                        }
                    });
                }
            );
        });
    });
});

// ===============================
// TEST DATABASE
// ===============================
app.get("/test-db", (req, res) => {

    db.query("SELECT 1 AS result", (err, results) => {

        if (err) {

            return res.status(500).json({
                message: "Database query failed",
                error: err.message
            });
        }

        res.status(200).json({
            message: "Database query successful",
            data: results
        });
    });
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );
});