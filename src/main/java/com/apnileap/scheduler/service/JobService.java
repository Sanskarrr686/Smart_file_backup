package com.apnileap.scheduler.service;

import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.IdempotencyRecord;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.WorkerState;
import com.apnileap.scheduler.events.SseService;
import com.apnileap.scheduler.exception.BusinessException;
import com.apnileap.scheduler.lock.LockService;
import com.apnileap.scheduler.mapper.JobMapper;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.IdempotencyRecordRepository;
import com.apnileap.scheduler.repository.WaitForEdgeRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class JobService {
    private static final Set<JobState> TERMINAL = Set.of(
            JobState.COMPLETED, JobState.CANCELLED, JobState.FAILED, JobState.REJECTED);

    private final BackupJobRepository jobRepo;
    private final IdempotencyRecordRepository idempotencyRepo;
    private final WorkerRepository workerRepo;
    private final WaitForEdgeRepository edgeRepo;
    private final LockService lockService;
    private final JobMapper jobMapper;
    private final SseService sseService;
    private final ObjectMapper objectMapper;

    public JobService(BackupJobRepository jobRepo, IdempotencyRecordRepository idempotencyRepo,
                      WorkerRepository workerRepo, WaitForEdgeRepository edgeRepo,
                      LockService lockService, JobMapper jobMapper,
                      SseService sseService, ObjectMapper objectMapper) {
        this.jobRepo = jobRepo;
        this.idempotencyRepo = idempotencyRepo;
        this.workerRepo = workerRepo;
        this.edgeRepo = edgeRepo;
        this.lockService = lockService;
        this.jobMapper = jobMapper;
        this.sseService = sseService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public Map<String, Object> submitJob(BackupJobRequest request, String correlationId, String idempotencyKey) {
        if (idempotencyKey != null) {
            Optional<IdempotencyRecord> existing = idempotencyRepo.findById(idempotencyKey);
            if (existing.isPresent()) {
                try {
                    return objectMapper.readValue(existing.get().getOriginalResponse(), new TypeReference<Map<String, Object>>() {});
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

        publishState(job);
        return response;
    }

    public BackupJob getJob(String jobId) {
        return jobRepo.findById(jobId).orElseThrow(() -> new BusinessException("NOT_FOUND", "Job not found"));
    }

    public List<BackupJob> listJobs() {
        return jobRepo.findAll().stream()
                .sorted(Comparator.comparing(BackupJob::getSubmittedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    @Transactional
    public BackupJob cancelJob(String jobId) {
        return terminate(jobId, JobState.CANCELLED, "Job cancelled");
    }

    @Transactional
    public BackupJob failJob(String jobId, String reason) {
        return terminate(jobId, JobState.FAILED, reason == null ? "Job failed" : reason);
    }

    private BackupJob terminate(String jobId, JobState target, String reason) {
        BackupJob job = getJob(jobId);
        if (TERMINAL.contains(job.getState())) {
            throw new BusinessException("INVALID_STATE", "Job is already " + job.getState());
        }

        if (job.getLeaseId() != null) {
            lockService.releaseLock(job.getLeaseId());
            job.setLeaseId(null);
        }

        if (job.getAssignedWorkerId() != null) {
            workerRepo.findById(job.getAssignedWorkerId()).ifPresent(this::freeWorker);
            job.setAssignedWorkerId(null);
        }

        edgeRepo.deleteByWaitingJobIdOrBlockingJobId(job.getJobId(), job.getJobId());
        job.setState(target);
        job.setCompletedAt(Instant.now());
        jobRepo.save(job);
        publishState(job);
        return job;
    }

    private void freeWorker(Worker worker) {
        worker.setState(WorkerState.AVAILABLE);
        worker.setCurrentJobId(null);
        workerRepo.save(worker);
    }

    private void publishState(BackupJob job) {
        sseService.publishEvent(Map.of(
                "event_type", "JOB_STATE_CHANGED",
                "job_id", job.getJobId(),
                "state", job.getState().name(),
                "timestamp", Instant.now().toString(),
                "correlation_id", job.getCorrelationId() != null ? job.getCorrelationId() : "sys"
        ));
    }
}
