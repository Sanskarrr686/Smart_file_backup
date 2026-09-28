package com.apnileap.scheduler.mapper;
import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import org.springframework.stereotype.Component;
import java.time.Instant;

@Component
public class JobMapper {
    public BackupJob toEntity(BackupJobRequest request, String correlationId, String idempotencyKey) {
        return BackupJob.builder()
                .jobId(request.getJobId())
                .backupId(request.getBackupId())
                .userId(request.getUserId())
                .fileId(request.getFileId())
                .backupType(request.getBackupType())
                .sourcePath(request.getSourcePath())
                .preferredWindow(request.getPreferredWindow() == null || request.getPreferredWindow().isBlank()
                        ? "ANY" : request.getPreferredWindow())
                .priority(request.getPriority())
                .estimatedDurationMs(request.getEstimatedDurationMs())
                .remainingDurationMs(request.getEstimatedDurationMs())
                .state(JobState.QUEUED)
                .submittedAt(Instant.now())
                .correlationId(correlationId)
                .idempotencyKey(idempotencyKey)
                .build();
    }
}
