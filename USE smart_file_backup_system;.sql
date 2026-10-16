USE smart_file_backup_system;

CREATE TABLE outbox_events (
    event_id BIGINT NOT NULL AUTO_INCREMENT,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id INT NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    payload JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (event_id),
    KEY idx_outbox_status_created (status, created_at),
    KEY idx_outbox_correlation_id (correlation_id)
) ENGINE=InnoDB;

INSERT INTO outbox_events
(
    event_type,
    aggregate_type,
    aggregate_id,
    correlation_id,
    payload
)
VALUES (?, ?, ?, ?, ?);

SHOW TABLES LIKE 'outbox_events';

SELECT * FROM outbox_events;

CREATE TABLE backup_jobs (
    job_id BIGINT NOT NULL AUTO_INCREMENT,
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    job_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
    log_id BIGINT NOT NULL AUTO_INCREMENT,
    log_level VARCHAR(20) NOT NULL,
    log_message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id)
) ENGINE=InnoDB;