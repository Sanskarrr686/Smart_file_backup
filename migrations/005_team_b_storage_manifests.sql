-- Track Team B storage-backed manifest creation separately from Team C backup state.
-- Safe to run repeatedly on MySQL 8.
USE smart_file_backup_system;

DROP PROCEDURE IF EXISTS _add_team_b_column;
DELIMITER $$
CREATE PROCEDURE _add_team_b_column(IN c VARCHAR(64), IN ddl VARCHAR(500))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'backup_jobs' AND column_name = c
  ) THEN
    SET @s = CONCAT('ALTER TABLE `backup_jobs` ADD COLUMN `', c, '` ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

CALL _add_team_b_column('team_b_manifest_status', "VARCHAR(24) NOT NULL DEFAULT 'NOT_REQUESTED'");
CALL _add_team_b_column('team_b_manifest_started_at', 'DATETIME NULL');
CALL _add_team_b_column('team_b_dedup_result_id', 'VARCHAR(255) NULL');
CALL _add_team_b_column('team_b_merkle_root', 'VARCHAR(255) NULL');
CALL _add_team_b_column('team_b_source_provider', 'VARCHAR(32) NULL');
CALL _add_team_b_column('team_b_source_bucket', 'VARCHAR(255) NULL');
CALL _add_team_b_column('team_b_source_key', 'VARCHAR(500) NULL');
CALL _add_team_b_column('team_b_manifest_error', 'TEXT NULL');

DROP PROCEDURE _add_team_b_column;
