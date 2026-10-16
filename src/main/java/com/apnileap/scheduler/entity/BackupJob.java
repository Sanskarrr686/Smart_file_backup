package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
public class BackupJob {
    public BackupJob() {
        super();
    }

    public BackupJob(String jobId, String backupId, String userId, String fileId, BackupType backupType,
                     String sourcePath, String preferredWindow, Integer priority, Long estimatedDurationMs,
                     Long remainingDurationMs, JobState state, Instant submittedAt, Instant startedAt,
                     Instant completedAt, String correlationId, String idempotencyKey, String assignedWorkerId,
                     String leaseId) {
        super();
        this.jobId = jobId;
        this.backupId = backupId;
        this.userId = userId;
        this.fileId = fileId;
        this.backupType = backupType;
        this.sourcePath = sourcePath;
        this.preferredWindow = preferredWindow;
        this.priority = priority;
        this.estimatedDurationMs = estimatedDurationMs;
        this.remainingDurationMs = remainingDurationMs;
        this.state = state;
        this.submittedAt = submittedAt;
        this.startedAt = startedAt;
        this.completedAt = completedAt;
        this.correlationId = correlationId;
        this.idempotencyKey = idempotencyKey;
        this.assignedWorkerId = assignedWorkerId;
        this.leaseId = leaseId;
    }
    @Id
    private String jobId;
    private String backupId;
    private String userId;
    private String fileId;
    
    @Enumerated(EnumType.STRING)
    private BackupType backupType;
    
    private String sourcePath;
    private String preferredWindow;

    private Integer priority;
    private Long estimatedDurationMs;
    private Long remainingDurationMs;
    
    @Enumerated(EnumType.STRING)
    private JobState state;
    
    private Instant submittedAt;
    private Instant startedAt;
    private Instant completedAt;
    
    private String correlationId;
    
    @Column(unique = true)
    private String idempotencyKey;
    
    private String assignedWorkerId;
    private String leaseId;
}
