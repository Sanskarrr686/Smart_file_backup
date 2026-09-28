import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Services
write_file("service/WorkerService.java", """
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkerService {
    private final WorkerRepository workerRepo;
    private final BackupJobRepository jobRepo;
    private final LockService lockService;
    private final MetricsService metricsService;
    private final SseService sseService;

    @Value("${scheduler.workers.initial-count:3}")
    private int initialWorkerCount;

    @PostConstruct
    public void init() {
        for (int i = 1; i <= initialWorkerCount; i++) {
            Worker worker = Worker.builder()
                .workerId("worker-" + i)
                .state(WorkerState.AVAILABLE)
                .totalBusyMs(0L)
                .build();
            workerRepo.save(worker);
        }
    }
    
    @Async
    @Transactional
    public void executeJob(String workerId, String jobId, Long quantumMs) {
        Worker worker = workerRepo.findById(workerId).orElseThrow();
        BackupJob job = jobRepo.findById(jobId).orElseThrow();
        
        long executionTime = job.getRemainingDurationMs();
        boolean interrupted = false;
        
        if (quantumMs != null && executionTime > quantumMs) {
            executionTime = quantumMs;
            interrupted = true;
        }
        
        try {
            Thread.sleep(executionTime);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        job.setRemainingDurationMs(job.getRemainingDurationMs() - executionTime);
        worker.setTotalBusyMs(worker.getTotalBusyMs() + executionTime);
        
        if (!interrupted || job.getRemainingDurationMs() <= 0) {
            job.setState(JobState.COMPLETED);
            job.setCompletedAt(Instant.now());
            job.setAssignedWorkerId(null);
            
            long waitMs = job.getStartedAt().toEpochMilli() - job.getSubmittedAt().toEpochMilli();
            long tatMs = job.getCompletedAt().toEpochMilli() - job.getSubmittedAt().toEpochMilli();
            metricsService.recordJobCompletion(waitMs, tatMs);
        } else {
            job.setState(JobState.READY);
            job.setAssignedWorkerId(null);
        }
        
        worker.setState(WorkerState.AVAILABLE);
        worker.setCurrentJobId(null);
        
        if (job.getLeaseId() != null) {
            lockService.releaseLock(job.getLeaseId());
            job.setLeaseId(null);
        }
        
        jobRepo.save(job);
        workerRepo.save(worker);
        
        sseService.publishEvent(Map.of(
                "event_type", "JOB_STATE_CHANGED",
                "job_id", job.getJobId(),
                "state", job.getState().name(),
                "timestamp", Instant.now().toString(),
                "correlation_id", job.getCorrelationId()
        ));
    }
}
""")

write_file("service/SchedulerService.java", """
package com.apnileap.scheduler.service;
import com.apnileap.scheduler.dto.AcquireLockRequest;
import com.apnileap.scheduler.entity.*;
import com.apnileap.scheduler.lock.LockService;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.SchedulingDecisionRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import com.apnileap.scheduler.scheduler.SchedulingStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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
    private final List<SchedulingStrategy> strategies;

    @Transactional
    public void runScheduler(String policy, Long quantumMs) {
        SchedulingStrategy strategy = strategies.stream()
                .filter(s -> s.getPolicyName().equalsIgnoreCase(policy))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown policy: " + policy));

        List<BackupJob> readyJobs = jobRepo.findByState(JobState.READY);
        readyJobs.addAll(jobRepo.findByState(JobState.QUEUED));
        
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
""")

write_file("service/JobService.java", """
package com.apnileap.scheduler.service;
import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.IdempotencyRecord;
import com.apnileap.scheduler.events.SseService;
import com.apnileap.scheduler.exception.BusinessException;
import com.apnileap.scheduler.mapper.JobMapper;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.IdempotencyRecordRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class JobService {
    private final BackupJobRepository jobRepo;
    private final IdempotencyRecordRepository idempotencyRepo;
    private final JobMapper jobMapper;
    private final SseService sseService;
    private final ObjectMapper objectMapper;

    @Transactional
    public Map<String, Object> submitJob(BackupJobRequest request, String correlationId, String idempotencyKey) {
        if (idempotencyKey != null) {
            Optional<IdempotencyRecord> existing = idempotencyRepo.findById(idempotencyKey);
            if (existing.isPresent()) {
                try {
                    return objectMapper.readValue(existing.get().getOriginalResponse(), Map.class);
                } catch (JsonProcessingException e) {
                    throw new RuntimeException(e);
                }
            }
        }
        
        if (jobRepo.existsById(request.getJobId())) {
            throw new BusinessException("DUPLICATE_JOB", "Job ID already exists");
        }
        
        BackupJob job = jobMapper.toEntity(request, correlationId, idempotencyKey);
        jobRepo.save(job);
        
        Map<String, Object> response = Map.of(
            "job_id", job.getJobId(),
            "state", job.getState().name(),
            "queue_position", jobRepo.countByState(job.getState()),
            "estimated_start", "TBD",
            "correlation_id", correlationId
        );
        
        if (idempotencyKey != null) {
            try {
                IdempotencyRecord record = IdempotencyRecord.builder()
                        .idempotencyKey(idempotencyKey)
                        .originalResponse(objectMapper.writeValueAsString(response))
                        .createdAt(Instant.now())
                        .build();
                idempotencyRepo.save(record);
            } catch (JsonProcessingException e) {
                // Ignore
            }
        }
        
        sseService.publishEvent(Map.of(
                "event_type", "JOB_STATE_CHANGED",
                "job_id", job.getJobId(),
                "state", job.getState().name(),
                "timestamp", Instant.now().toString(),
                "correlation_id", correlationId
        ));
        
        return response;
    }
    
    public BackupJob getJob(String jobId) {
        return jobRepo.findById(jobId).orElseThrow(() -> new BusinessException("NOT_FOUND", "Job not found"));
    }
}
""")

print("Services created successfully.")
