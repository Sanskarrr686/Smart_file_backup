import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\test\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

write_file("SchedulerApplicationTests.java", """
package com.apnileap.scheduler;

import com.apnileap.scheduler.dto.AcquireLockRequest;
import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.*;
import com.apnileap.scheduler.lock.DeadlockService;
import com.apnileap.scheduler.lock.LockService;
import com.apnileap.scheduler.repository.*;
import com.apnileap.scheduler.scheduler.*;
import com.apnileap.scheduler.service.JobService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class SchedulerApplicationTests {

    @Autowired private JobService jobService;
    @Autowired private LockService lockService;
    @Autowired private DeadlockService deadlockService;
    @Autowired private BackupJobRepository jobRepo;
    @Autowired private WorkerRepository workerRepo;
    @Autowired private LeaseRepository leaseRepo;
    @Autowired private WaitForEdgeRepository edgeRepo;
    @Autowired private FcfsStrategy fcfs;
    @Autowired private SjfStrategy sjf;
    @Autowired private PriorityStrategy priority;

    @BeforeEach
    void setup() {
        edgeRepo.deleteAll();
        leaseRepo.deleteAll();
        jobRepo.deleteAll();
        workerRepo.deleteAll();
        
        for (int i = 1; i <= 3; i++) {
            workerRepo.save(Worker.builder().workerId("w" + i).state(WorkerState.AVAILABLE).build());
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
        
        Map<String, Object> r1 = jobService.submitJob(req, "corr-1", "idem-key-1");
        assertEquals("job-1", r1.get("job_id"));
        
        Map<String, Object> r2 = jobService.submitJob(req, "corr-2", "idem-key-1");
        assertEquals("job-1", r2.get("job_id"));
        assertEquals(r1.get("correlation_id"), r2.get("correlation_id"));
        
        assertEquals(1, jobRepo.count());
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
        
        assertEquals(JobState.CANCELLED, jobRepo.findById("j2").get().getState());
    }
    
    @Test
    void testStrategies() {
        BackupJob j1 = BackupJob.builder().jobId("j1").priority(1).remainingDurationMs(5000L).submittedAt(Instant.now().plusSeconds(2)).build();
        BackupJob j2 = BackupJob.builder().jobId("j2").priority(5).remainingDurationMs(1000L).submittedAt(Instant.now().plusSeconds(1)).build();
        
        List<BackupJob> jobs = List.of(j1, j2);
        List<Worker> workers = List.of(Worker.builder().workerId("w1").build());
        
        // FCFS selects earliest submitted: j2
        assertEquals("j2", fcfs.schedule(jobs, workers).get(0).getJobId());
        
        // SJF selects shortest: j2
        assertEquals("j2", sjf.schedule(jobs, workers).get(0).getJobId());
        
        // Priority selects highest: j2
        assertEquals("j2", priority.schedule(jobs, workers).get(0).getJobId());
    }
}
""")
print("Tests generated.")
