package com.apnileap.scheduler.scheduler;

import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.SchedulingDecision;
import com.apnileap.scheduler.entity.Worker;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Component
public class RoundRobinStrategy implements SchedulingStrategy {
    private final AtomicInteger cursor = new AtomicInteger(0);

    @Override
    public String getPolicyName() {
        return "RR";
    }

    @Override
    public List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers) {
        List<BackupJob> sortedJobs = jobs.stream()
                .sorted(Comparator.comparing(BackupJob::getSubmittedAt))
                .collect(Collectors.toList());

        List<SchedulingDecision> decisions = new ArrayList<>();
        if (sortedJobs.isEmpty() || workers.isEmpty()) {
            return decisions;
        }

        int n = sortedJobs.size();
        int assignCount = Math.min(workers.size(), n);
        int start = Math.floorMod(cursor.getAndAdd(assignCount), n);

        for (int i = 0; i < assignCount; i++) {
            BackupJob job = sortedJobs.get((start + i) % n);
            Worker worker = workers.get(i);
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
        return decisions;
    }
}
