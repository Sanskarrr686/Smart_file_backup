-- Additive migration: preserve existing users and mark them active by default.
-- Apply once to smart_file_backup_system before starting the identity middleware.
ALTER TABLE users
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER password_hash;
