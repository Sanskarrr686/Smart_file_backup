package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BackupJobRepository extends JpaRepository<BackupJob, String> {
    List<BackupJob> findByState(JobState state);
    List<BackupJob> findByStateIn(Collection<JobState> states);
    Optional<BackupJob> findByIdempotencyKey(String idempotencyKey);
    List<BackupJob> findByAssignedWorkerId(String workerId);
    List<BackupJob> findByFileIdAndState(String fileId, JobState state);
    long countByState(JobState state);
}
