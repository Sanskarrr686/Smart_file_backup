package com.apnileap.scheduler;

import com.apnileap.scheduler.dto.AcquireLockRequest;
import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.BackupType;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.LockMode;
import com.apnileap.scheduler.entity.WaitForEdge;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.WorkerState;
import com.apnileap.scheduler.lock.DeadlockService;
import com.apnileap.scheduler.lock.LockService;
import com.apnileap.scheduler.metrics.MetricsService;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.IdempotencyRecordRepository;
import com.apnileap.scheduler.repository.LeaseRepository;
import com.apnileap.scheduler.repository.SchedulingDecisionRepository;
import com.apnileap.scheduler.repository.WaitForEdgeRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import com.apnileap.scheduler.scheduler.FcfsStrategy;
import com.apnileap.scheduler.scheduler.PreferredWindowPolicy;
import com.apnileap.scheduler.scheduler.PriorityStrategy;
import com.apnileap.scheduler.scheduler.RoundRobinStrategy;
import com.apnileap.scheduler.scheduler.SjfStrategy;
import com.apnileap.scheduler.service.JobService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
class SchedulerApplicationTests {

    @Autowired private JobService jobService;
    @Autowired private LockService lockService;
    @Autowired private DeadlockService deadlockService;
    @Autowired private MetricsService metricsService;
    @Autowired private BackupJobRepository jobRepo;
    @Autowired private WorkerRepository workerRepo;
    @Autowired private LeaseRepository leaseRepo;
    @Autowired private WaitForEdgeRepository edgeRepo;
    @Autowired private IdempotencyRecordRepository idempotencyRepo;
    @Autowired private SchedulingDecisionRepository decisionRepo;
    @Autowired private FcfsStrategy fcfs;
    @Autowired private SjfStrategy sjf;
    @Autowired private PriorityStrategy priority;

    @BeforeEach
    void setup() {
        edgeRepo.deleteAll();
        leaseRepo.deleteAll();
        decisionRepo.deleteAll();
        jobRepo.deleteAll();
        workerRepo.deleteAll();
        idempotencyRepo.deleteAll();

        for (int i = 1; i <= 3; i++) {
            workerRepo.save(Worker.builder().workerId("w" + i).state(WorkerState.AVAILABLE).totalBusyMs(0L).build());
        }
    }

    @Test
    void testIdempotency() {
        BackupJobRequest req = new BackupJobRequest();
        req.setJobId("job-1");
        req.setBackupId("b-1");
        req.setUserId("u-1");
        req.setFileId("f-1");
        req.setBackupType(BackupType.BACKUP);
        req.setPriority(1);
        req.setEstimatedDurationMs(100L);
        req.setSourcePath("/docs/a.pdf");
        req.setPreferredWindow("ANY");

        Map<String, Object> r1 = jobService.submitJob(req, "corr-1", "idem-key-1");
        assertEquals("job-1", r1.get("job_id"));

        Map<String, Object> r2 = jobService.submitJob(req, "corr-2", "idem-key-1");
        assertEquals("job-1", r2.get("job_id"));
        assertEquals(r1.get("correlation_id"), r2.get("correlation_id"));

        assertEquals(1, jobRepo.count());
        assertEquals("/docs/a.pdf", jobRepo.findById("job-1").orElseThrow().getSourcePath());
    }

    @Test
    void testLockConflict() {
        AcquireLockRequest r1 = new AcquireLockRequest();
        r1.setFileId("file-1");
        r1.setHolderId("job-1");
        r1.setLockMode(LockMode.EXCLUSIVE);
        r1.setLeaseTimeoutMs(10000L);

        lockService.acquireLock(r1);

        AcquireLockRequest r2 = new AcquireLockRequest();
        r2.setFileId("file-1");
        r2.setHolderId("job-2");
        r2.setLockMode(LockMode.EXCLUSIVE);
        r2.setLeaseTimeoutMs(10000L);

        assertThrows(Exception.class, () -> lockService.acquireLock(r2));
        assertEquals(1, edgeRepo.count());
    }

    @Test
    void testWaitingForLockIsRequeuedAfterRelease() {
        jobRepo.save(BackupJob.builder()
                .jobId("waiter")
                .fileId("file-1")
                .priority(1)
                .state(JobState.WAITING_FOR_LOCK)
                .submittedAt(Instant.now())
                .build());

        AcquireLockRequest holder = new AcquireLockRequest();
        holder.setFileId("file-1");
        holder.setHolderId("owner");
        holder.setLockMode(LockMode.EXCLUSIVE);
        holder.setLeaseTimeoutMs(10000L);
        var lease = lockService.acquireLock(holder);

        lockService.releaseLock(lease.getLeaseId());
        assertEquals(JobState.QUEUED, jobRepo.findById("waiter").orElseThrow().getState());
    }

    @Test
    void testDeadlockDetectionAndRecovery() {
        BackupJob j1 = BackupJob.builder().jobId("j1").priority(2).state(JobState.RUNNING).submittedAt(Instant.now()).build();
        BackupJob j2 = BackupJob.builder().jobId("j2").priority(1).state(JobState.RUNNING).submittedAt(Instant.now().plusSeconds(1)).build();
        jobRepo.save(j1);
        jobRepo.save(j2);

        edgeRepo.save(WaitForEdge.builder().waitingJobId("j1").blockingJobId("j2").build());
        edgeRepo.save(WaitForEdge.builder().waitingJobId("j2").blockingJobId("j1").build());

        Map<String, Object> res = deadlockService.analyseAndRecover();
        assertTrue((Boolean) res.get("cycle_detected"));
        assertEquals("j2", res.get("recovered_by_cancelling"));

        assertEquals(JobState.CANCELLED, jobRepo.findById("j2").orElseThrow().getState());
    }

    @Test
    void testStrategies() {
        BackupJob j1 = BackupJob.builder().jobId("j1").priority(1).remainingDurationMs(5000L).submittedAt(Instant.now().plusSeconds(2)).build();
        BackupJob j2 = BackupJob.builder().jobId("j2").priority(5).remainingDurationMs(1000L).submittedAt(Instant.now().plusSeconds(1)).build();

        List<BackupJob> jobs = List.of(j1, j2);
        List<Worker> workers = List.of(Worker.builder().workerId("w1").build());

        assertEquals("j2", fcfs.schedule(jobs, workers).get(0).getJobId());
        assertEquals("j2", sjf.schedule(jobs, workers).get(0).getJobId());
        assertEquals("j2", priority.schedule(jobs, workers).get(0).getJobId());
    }

    @Test
    void testRoundRobinRotates() {
        RoundRobinStrategy rr = new RoundRobinStrategy();
        Instant t0 = Instant.now();
        BackupJob j1 = BackupJob.builder().jobId("j1").submittedAt(t0).build();
        BackupJob j2 = BackupJob.builder().jobId("j2").submittedAt(t0.plusSeconds(1)).build();
        BackupJob j3 = BackupJob.builder().jobId("j3").submittedAt(t0.plusSeconds(2)).build();
        List<BackupJob> jobs = List.of(j1, j2, j3);
        List<Worker> workers = List.of(Worker.builder().workerId("w1").build());

        assertEquals("j1", rr.schedule(jobs, workers).get(0).getJobId());
        assertEquals("j2", rr.schedule(jobs, workers).get(0).getJobId());
        assertEquals("j3", rr.schedule(jobs, workers).get(0).getJobId());
        assertEquals("j1", rr.schedule(jobs, workers).get(0).getJobId());
    }

    @Test
    void testCancelJob() {
        BackupJobRequest req = new BackupJobRequest();
        req.setJobId("cancel-me");
        req.setBackupId("b-c");
        req.setUserId("u-1");
        req.setFileId("f-c");
        req.setBackupType(BackupType.BACKUP);
        req.setPriority(1);
        req.setEstimatedDurationMs(100L);
        jobService.submitJob(req, "corr-c", "idem-cancel");

        BackupJob cancelled = jobService.cancelJob("cancel-me");
        assertEquals(JobState.CANCELLED, cancelled.getState());
        assertThrows(Exception.class, () -> jobService.cancelJob("cancel-me"));
    }

    @Test
    void testPreferredWindowDayAndNight() {
        ZoneId zone = ZoneId.systemDefault();
        Instant day = LocalDate.now(zone).atTime(LocalTime.of(10, 0)).atZone(zone).toInstant();
        PreferredWindowPolicy dayPolicy = new PreferredWindowPolicy(Clock.fixed(day, zone));
        BackupJob nightJob = BackupJob.builder().preferredWindow("NIGHT").build();
        BackupJob dayJob = BackupJob.builder().preferredWindow("DAY").build();
        BackupJob anyJob = BackupJob.builder().preferredWindow("ANY").build();

        assertFalse(dayPolicy.allows(nightJob));
        assertTrue(dayPolicy.allows(dayJob));
        assertTrue(dayPolicy.allows(anyJob));
    }

    @Test
    void testStarvationIndicator() {
        jobRepo.save(BackupJob.builder()
                .jobId("starved")
                .priority(1)
                .state(JobState.QUEUED)
                .submittedAt(Instant.now().minusSeconds(120))
                .build());

        Map<String, Object> metrics = metricsService.getMetrics();
        assertEquals(true, metrics.get("starvation_indicator"));
        assertTrue(((Number) metrics.get("starved_job_count")).longValue() >= 1);
        assertTrue(metrics.containsKey("worker_utilization"));
        assertTrue(metrics.containsKey("throughput_per_sec"));
    }
}
