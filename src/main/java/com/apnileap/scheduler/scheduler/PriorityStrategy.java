package com.apnileap.scheduler.scheduler;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.SchedulingDecision;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import java.util.UUID;

@Component
public class PriorityStrategy implements SchedulingStrategy {
    @Override
    public String getPolicyName() { return "PRIORITY"; }

    @Override
    public List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers) {
        PriorityQueue<BackupJob> pq = new PriorityQueue<>(
            Comparator.comparing(BackupJob::getPriority, Comparator.reverseOrder())
                      .thenComparing(BackupJob::getSubmittedAt)
        );
        pq.addAll(jobs);
            
        List<SchedulingDecision> decisions = new ArrayList<>();
        for (Worker worker : workers) {
            BackupJob job = pq.poll();
            if (job != null) {
                decisions.add(SchedulingDecision.builder()
                    .decisionId(UUID.randomUUID().toString())
                    .jobId(job.getJobId())
                    .workerId(worker.getWorkerId())
                    .policy(getPolicyName())
                    .algorithmVersion("1.0")
                    .scheduledStart(Instant.now())
                    .estimatedWaitMs(Instant.now().toEpochMilli() - job.getSubmittedAt().toEpochMilli())
                    .build());
            }
        }
        return decisions;
    }
}
