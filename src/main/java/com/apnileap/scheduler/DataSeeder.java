package com.apnileap.scheduler;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.BackupType;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.repository.BackupJobRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.UUID;

@Component
@Profile("!test")
public class DataSeeder {
    private final BackupJobRepository jobRepo;

    public DataSeeder(BackupJobRepository jobRepo) {
        this.jobRepo = jobRepo;
    }

    @PostConstruct
    public void seed() {
        if (jobRepo.count() == 0) {
            for (int i = 1; i <= 10; i++) {
                BackupJob job = BackupJob.builder()
                        .jobId("seed-job-" + i)
                        .backupId("bkp-" + i)
                        .userId("user-" + (i % 3))
                        .fileId("file-" + i)
                        .backupType(BackupType.BACKUP)
                        .sourcePath("/seed/file-" + i)
                        .preferredWindow("ANY")
                        .priority(i % 5 + 1)
                        .estimatedDurationMs(1000L * i)
                        .remainingDurationMs(1000L * i)
                        .state(JobState.QUEUED)
                        .submittedAt(Instant.now().minusSeconds(100 - i))
                        .correlationId(UUID.randomUUID().toString())
                        .idempotencyKey(UUID.randomUUID().toString())
                        .build();
                jobRepo.save(job);
            }
        }
    }
}
