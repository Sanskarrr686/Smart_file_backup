-- SAFE TO RUN ON ANY STATE: original Member-2 dump, or the v3 dump.
-- It only adds what is missing and never deletes data.
--   mysql -u root -p smart_file_backup_system < migrations/004_apply_all_idempotent.sql
-- (in Workbench: open this file in a normal SQL tab and execute with the lightning bolt)
USE smart_file_backup_system;

DROP PROCEDURE IF EXISTS _add_column;
DROP PROCEDURE IF EXISTS _add_unique;
DELIMITER $$
CREATE PROCEDURE _add_column(IN t VARCHAR(64), IN c VARCHAR(64), IN ddl VARCHAR(500))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = t AND column_name = c) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
CREATE PROCEDURE _add_unique(IN t VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(200))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = t AND index_name = idx) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD UNIQUE KEY `', idx, '` (', cols, ')');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

-- 001: active flag
CALL _add_column('users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER password_hash');

-- 004: username for Team D login (existing users get the part of their email before @)
CALL _add_column('users', 'username', 'VARCHAR(50) NULL AFTER user_id');
UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE username IS NULL OR username = '';
ALTER TABLE users MODIFY username VARCHAR(50) NOT NULL;
CALL _add_unique('users', 'uq_users_username', '`username`');

-- 002: actor-aware audit rows are written by the application, so drop the owner-attributed triggers
DROP TRIGGER IF EXISTS trg_after_backup_insert;
DROP TRIGGER IF EXISTS trg_after_backup_update;

-- 003: object references + upload idempotency
CALL _add_column('files', 'upload_idempotency_key', 'VARCHAR(100) NULL');
CALL _add_unique('files', 'uq_files_owner_upload_key', '`user_id`, `upload_idempotency_key`');
CALL _add_column('file_versions', 'object_key', 'VARCHAR(500) NULL');
CALL _add_column('backup_jobs', 'backup_object_key', 'VARCHAR(500) NULL');
CALL _add_column('backup_jobs', 'failure_reason', 'TEXT NULL');
CALL _add_column('restore_requests', 'restored_object_key', 'VARCHAR(500) NULL');
CALL _add_column('restore_requests', 'error_message', 'TEXT NULL');

-- 005: Team B storage-backed manifest tracking
CALL _add_column('backup_jobs', 'team_b_manifest_status', "VARCHAR(24) NOT NULL DEFAULT 'NOT_REQUESTED'");
CALL _add_column('backup_jobs', 'team_b_manifest_started_at', 'DATETIME NULL');
CALL _add_column('backup_jobs', 'team_b_dedup_result_id', 'VARCHAR(255) NULL');
CALL _add_column('backup_jobs', 'team_b_merkle_root', 'VARCHAR(255) NULL');
CALL _add_column('backup_jobs', 'team_b_source_provider', 'VARCHAR(32) NULL');
CALL _add_column('backup_jobs', 'team_b_source_bucket', 'VARCHAR(255) NULL');
CALL _add_column('backup_jobs', 'team_b_source_key', 'VARCHAR(500) NULL');
CALL _add_column('backup_jobs', 'team_b_manifest_error', 'TEXT NULL');

DROP PROCEDURE _add_column;
DROP PROCEDURE _add_unique;

-- Passwords: plaintext/placeholder hashes cannot log in. Seed users get a bcrypt hash via
--   node scripts/seed_passwords.js        (demo password: Password@123)
