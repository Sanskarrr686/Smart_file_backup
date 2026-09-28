package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BackupJob {
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
