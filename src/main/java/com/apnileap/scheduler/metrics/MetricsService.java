package com.apnileap.scheduler.metrics;

import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.LeaseState;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.LeaseRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class MetricsService {
    private final BackupJobRepository jobRepo;
    private final LeaseRepository leaseRepo;
    private final WorkerRepository workerRepo;
    private final Instant startedAt = Instant.now();

    private final AtomicLong lockConflicts = new AtomicLong(0);
    private final AtomicLong expiredLeases = new AtomicLong(0);
    private final AtomicLong deadlocksDetected = new AtomicLong(0);
    private final AtomicLong deadlocksResolved = new AtomicLong(0);
    private final AtomicLong totalWaitTime = new AtomicLong(0);
    private final AtomicLong totalTurnaroundTime = new AtomicLong(0);
    private final AtomicLong completedCount = new AtomicLong(0);

    @Value("${scheduler.starvation-wait-threshold-ms:30000}")
    private long starvationWaitThresholdMs;

    public MetricsService(BackupJobRepository jobRepo, LeaseRepository leaseRepo, WorkerRepository workerRepo) {
        this.jobRepo = jobRepo;
        this.leaseRepo = leaseRepo;
        this.workerRepo = workerRepo;
    }

    public void incrementLockConflicts() { lockConflicts.incrementAndGet(); }
    public void incrementExpiredLeases() { expiredLeases.incrementAndGet(); }
    public void incrementDeadlocksDetected() { deadlocksDetected.incrementAndGet(); }
    public void incrementDeadlocksResolved() { deadlocksResolved.incrementAndGet(); }

    public void recordJobCompletion(long waitMs, long turnaroundMs) {
        totalWaitTime.addAndGet(waitMs);
        totalTurnaroundTime.addAndGet(turnaroundMs);
        completedCount.incrementAndGet();
    }

    public Map<String, Object> getMetrics() {
        long queued = jobRepo.countByState(JobState.QUEUED) + jobRepo.countByState(JobState.READY)
                + jobRepo.countByState(JobState.WAITING_FOR_LOCK);
        long active = jobRepo.countByState(JobState.RUNNING);
        long completed = jobRepo.countByState(JobState.COMPLETED);
        long failed = jobRepo.countByState(JobState.FAILED);
        long cancelled = jobRepo.countByState(JobState.CANCELLED);
        long activeLeases = leaseRepo.countByState(LeaseState.ACTIVE);

        long count = completedCount.get();
        double avgWait = count > 0 ? (double) totalWaitTime.get() / count : 0.0;
        double avgTurnaround = count > 0 ? (double) totalTurnaroundTime.get() / count : 0.0;

        List<Worker> workers = workerRepo.findAll();
        long elapsedMs = Math.max(Duration.between(startedAt, Instant.now()).toMillis(), 1L);
        long totalBusy = workers.stream().mapToLong(w -> w.getTotalBusyMs() == null ? 0L : w.getTotalBusyMs()).sum();
        double utilization = workers.isEmpty() ? 0.0 : Math.min(1.0, (double) totalBusy / (workers.size() * elapsedMs));

        Instant cutoff = Instant.now().minusMillis(starvationWaitThresholdMs);
        boolean starvation = jobRepo.findByStateIn(List.of(JobState.QUEUED, JobState.READY, JobState.WAITING_FOR_LOCK))
                .stream()
                .anyMatch(job -> job.getSubmittedAt() != null && job.getSubmittedAt().isBefore(cutoff));

        long starvedCount = jobRepo.findByStateIn(List.of(JobState.QUEUED, JobState.READY, JobState.WAITING_FOR_LOCK))
                .stream()
                .filter(job -> job.getSubmittedAt() != null && job.getSubmittedAt().isBefore(cutoff))
                .map(BackupJob::getJobId)
                .count();

        double throughputPerSec = elapsedMs > 0 ? (completedCount.get() * 1000.0) / elapsedMs : 0.0;

        return Map.ofEntries(
                Map.entry("queue_depth", queued),
                Map.entry("active_jobs", active),
                Map.entry("completed_jobs", completed),
                Map.entry("failed_jobs", failed),
                Map.entry("cancelled_jobs", cancelled),
                Map.entry("throughput", completed),
                Map.entry("throughput_per_sec", throughputPerSec),
                Map.entry("average_wait_time_ms", avgWait),
                Map.entry("average_turnaround_time_ms", avgTurnaround),
                Map.entry("worker_utilization", utilization),
                Map.entry("lock_conflicts", lockConflicts.get()),
                Map.entry("active_leases", activeLeases),
                Map.entry("expired_leases", expiredLeases.get()),
                Map.entry("deadlocks_detected", deadlocksDetected.get()),
                Map.entry("deadlocks_resolved", deadlocksResolved.get()),
                Map.entry("starvation_indicator", starvation),
                Map.entry("starved_job_count", starvedCount)
        );
    }
}
