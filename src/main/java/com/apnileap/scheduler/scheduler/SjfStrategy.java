package com.apnileap.scheduler.scheduler;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.SchedulingDecision;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class SjfStrategy implements SchedulingStrategy {
    @Override
    public String getPolicyName() { return "SJF"; }

    @Override
    public List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers) {
        List<BackupJob> sortedJobs = jobs.stream()
            .sorted(Comparator.comparing(BackupJob::getRemainingDurationMs)
                              .thenComparing(BackupJob::getSubmittedAt))
            .collect(Collectors.toList());
            
        List<SchedulingDecision> decisions = new ArrayList<>();
        int i = 0;
        for (Worker worker : workers) {
            if (i < sortedJobs.size()) {
                BackupJob job = sortedJobs.get(i++);
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
