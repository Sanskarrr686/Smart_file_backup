package com.apnileap.scheduler.service;

import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.WorkerState;
import com.apnileap.scheduler.events.SseService;
import com.apnileap.scheduler.lock.LockService;
import com.apnileap.scheduler.metrics.MetricsService;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

@Service
@Slf4j
public class WorkerService {
    private static final Set<JobState> TERMINAL = Set.of(
            JobState.COMPLETED, JobState.CANCELLED, JobState.FAILED, JobState.REJECTED);

    private final WorkerRepository workerRepo;
    private final BackupJobRepository jobRepo;
    private final LockService lockService;
    private final MetricsService metricsService;
    private final SseService sseService;

    public WorkerService(WorkerRepository workerRepo, BackupJobRepository jobRepo,
                         LockService lockService, MetricsService metricsService,
                         SseService sseService) {
        this.workerRepo = workerRepo;
        this.jobRepo = jobRepo;
        this.lockService = lockService;
        this.metricsService = metricsService;
        this.sseService = sseService;
    }

    @Value("${scheduler.workers.initial-count:3}")
    private int initialWorkerCount;

    @PostConstruct
    public void init() {
        if (workerRepo.count() > 0) {
            return;
        }
        for (int i = 1; i <= initialWorkerCount; i++) {
            workerRepo.save(Worker.builder()
                    .workerId("worker-" + i)
                    .state(WorkerState.AVAILABLE)
                    .totalBusyMs(0L)
                    .build());
        }
    }

    @Async
    public void executeJob(String workerId, String jobId, Long quantumMs) {
        try {
            Worker worker = workerRepo.findById(workerId).orElseThrow();
            BackupJob job = jobRepo.findById(jobId).orElseThrow();

            long remaining = job.getRemainingDurationMs() == null ? 0L : job.getRemainingDurationMs();
            long executionTime = remaining;
            boolean interrupted = false;

            if (quantumMs != null && executionTime > quantumMs) {
                executionTime = quantumMs;
                interrupted = true;
            }

            try {
                Thread.sleep(Math.max(executionTime, 0L));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                failJob(job, worker, "Worker interrupted");
                return;
            }

            job = jobRepo.findById(jobId).orElseThrow();
            worker = workerRepo.findById(workerId).orElseThrow();
            if (TERMINAL.contains(job.getState())) {
                freeWorker(worker);
                return;
            }

            job.setRemainingDurationMs(Math.max(remaining - executionTime, 0L));
            worker.setTotalBusyMs((worker.getTotalBusyMs() == null ? 0L : worker.getTotalBusyMs()) + executionTime);

            if (!interrupted || job.getRemainingDurationMs() <= 0) {
                job.setState(JobState.COMPLETED);
                job.setCompletedAt(Instant.now());
                job.setAssignedWorkerId(null);
                long waitMs = job.getStartedAt() != null && job.getSubmittedAt() != null
                        ? job.getStartedAt().toEpochMilli() - job.getSubmittedAt().toEpochMilli() : 0L;
                long tatMs = job.getSubmittedAt() != null
                        ? job.getCompletedAt().toEpochMilli() - job.getSubmittedAt().toEpochMilli() : 0L;
                metricsService.recordJobCompletion(waitMs, tatMs);
            } else {
                job.setState(JobState.READY);
                job.setAssignedWorkerId(null);
            }

            releaseLease(job);
            freeWorker(worker);
            jobRepo.save(job);
            workerRepo.save(worker);
            publish(job);
        } catch (Exception e) {
            log.warn("Job {} failed on {}: {}", jobId, workerId, e.getMessage());
            jobRepo.findById(jobId).ifPresent(job ->
                    workerRepo.findById(workerId).ifPresent(worker -> failJob(job, worker, e.getMessage())));
        }
    }

    private void failJob(BackupJob job, Worker worker, String reason) {
        if (!TERMINAL.contains(job.getState())) {
            job.setState(JobState.FAILED);
            job.setAssignedWorkerId(null);
            job.setCompletedAt(Instant.now());
            releaseLease(job);
            jobRepo.save(job);
            publish(job);
        }
        freeWorker(worker);
        workerRepo.save(worker);
        log.debug("Fail reason: {}", reason);
    }

    private void releaseLease(BackupJob job) {
        if (job.getLeaseId() != null) {
            lockService.releaseLock(job.getLeaseId());
            job.setLeaseId(null);
        }
    }

    private void freeWorker(Worker worker) {
        worker.setState(WorkerState.AVAILABLE);
        worker.setCurrentJobId(null);
    }

    private void publish(BackupJob job) {
        sseService.publishEvent(Map.of(
                "event_type", "JOB_STATE_CHANGED",
                "job_id", job.getJobId(),
                "state", job.getState().name(),
                "timestamp", Instant.now().toString(),
                "correlation_id", job.getCorrelationId() != null ? job.getCorrelationId() : "sys"
        ));
    }
}
