-- Additive metadata required to replay uploads and restore exact versions.
ALTER TABLE files
    ADD COLUMN upload_idempotency_key VARCHAR(100) NULL,
    ADD UNIQUE KEY uq_files_owner_upload_key (user_id, upload_idempotency_key);

ALTER TABLE file_versions
    ADD COLUMN object_key VARCHAR(500) NULL;

ALTER TABLE backup_jobs
    ADD COLUMN backup_object_key VARCHAR(500) NULL,
    ADD COLUMN failure_reason TEXT NULL;

ALTER TABLE restore_requests
    ADD COLUMN restored_object_key VARCHAR(500) NULL,
    ADD COLUMN error_message TEXT NULL;
