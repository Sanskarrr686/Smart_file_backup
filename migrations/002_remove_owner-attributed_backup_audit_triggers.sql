-- The old triggers attribute all backup state changes to the backup owner,
-- even when an administrator performs the action. Application code already
-- writes actor-aware CREATE and CANCEL audit rows, so remove these duplicates.
DROP TRIGGER IF EXISTS trg_after_backup_insert;
DROP TRIGGER IF EXISTS trg_after_backup_update;
