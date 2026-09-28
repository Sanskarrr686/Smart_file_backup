package com.apnileap.scheduler.service;

import com.apnileap.scheduler.dto.AcquireLockRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.Lease;
import com.apnileap.scheduler.entity.LockMode;
import com.apnileap.scheduler.entity.SchedulingDecision;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.WorkerState;
import com.apnileap.scheduler.exception.BusinessException;
import com.apnileap.scheduler.lock.LockService;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.SchedulingDecisionRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import com.apnileap.scheduler.scheduler.PreferredWindowPolicy;
import com.apnileap.scheduler.scheduler.SchedulingStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SchedulerService {
    private final BackupJobRepository jobRepo;
    private final WorkerRepository workerRepo;
    private final SchedulingDecisionRepository decisionRepo;
    private final WorkerService workerService;
    private final LockService lockService;
    private final PreferredWindowPolicy windowPolicy;
    private final List<SchedulingStrategy> strategies;
    private final AtomicBoolean running = new AtomicBoolean(false);

    @Value("${scheduler.auto-run.enabled:true}")
    private boolean autoRunEnabled;

    @Value("${scheduler.auto-run.policy:PRIORITY}")
    private String autoRunPolicy;

    @Value("${scheduler.auto-run.quantum-ms:2000}")
    private Long autoRunQuantumMs;

    @Scheduled(fixedDelayString = "${scheduler.auto-run.interval-ms:2000}")
    public void autoDispatch() {
        if (!autoRunEnabled) {
            return;
        }
        try {
            runScheduler(autoRunPolicy, autoRunQuantumMs);
        } catch (Exception e) {
            log.warn("Auto-dispatch skipped: {}", e.getMessage());
        }
    }

    @Transactional
    public void runScheduler(String policy, Long quantumMs) {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        try {
            dispatch(policy, quantumMs);
        } finally {
            running.set(false);
        }
    }

    private void dispatch(String policy, Long quantumMs) {
        SchedulingStrategy strategy = strategies.stream()
                .filter(s -> s.getPolicyName().equalsIgnoreCase(policy))
                .findFirst()
                .orElseThrow(() -> new BusinessException("UNKNOWN_POLICY", "Unknown policy: " + policy));

        List<BackupJob> readyJobs = jobRepo.findByStateIn(List.of(
                        JobState.READY, JobState.QUEUED, JobState.WAITING_FOR_LOCK))
                .stream()
                .filter(windowPolicy::allows)
                .collect(Collectors.toList());

        List<Worker> availableWorkers = workerRepo.findByState(WorkerState.AVAILABLE);

        if (readyJobs.isEmpty() || availableWorkers.isEmpty()) {
            return;
        }

        List<SchedulingDecision> decisions = strategy.schedule(readyJobs, availableWorkers);

        for (SchedulingDecision decision : decisions) {
            BackupJob job = jobRepo.findById(decision.getJobId()).orElseThrow();
            Worker worker = workerRepo.findById(decision.getWorkerId()).orElseThrow();

            try {
                AcquireLockRequest lockReq = new AcquireLockRequest();
                lockReq.setFileId(job.getFileId());
                lockReq.setHolderId(job.getJobId());
                lockReq.setLockMode(LockMode.EXCLUSIVE);

                Lease lease = lockService.acquireLock(lockReq);
                job.setLeaseId(lease.getLeaseId());
                job.setState(JobState.RUNNING);
                if (job.getStartedAt() == null) {
                    job.setStartedAt(Instant.now());
                }
                job.setAssignedWorkerId(worker.getWorkerId());

                worker.setState(WorkerState.BUSY);
                worker.setCurrentJobId(job.getJobId());

                decisionRepo.save(decision);
                jobRepo.save(job);
                workerRepo.save(worker);

                workerService.executeJob(worker.getWorkerId(), job.getJobId(), quantumMs);
            } catch (Exception e) {
                job.setState(JobState.WAITING_FOR_LOCK);
                jobRepo.save(job);
            }
        }
    }
}
