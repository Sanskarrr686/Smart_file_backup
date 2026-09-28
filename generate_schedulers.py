import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Scheduler Interface
write_file("scheduler/SchedulingStrategy.java", """
package com.apnileap.scheduler.scheduler;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.SchedulingDecision;
import java.util.List;

public interface SchedulingStrategy {
    String getPolicyName();
    List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers);
}
""")

# Strategies
write_file("scheduler/FcfsStrategy.java", """
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
public class FcfsStrategy implements SchedulingStrategy {
    @Override
    public String getPolicyName() { return "FCFS"; }

    @Override
    public List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers) {
        List<BackupJob> sortedJobs = jobs.stream()
            .sorted(Comparator.comparing(BackupJob::getSubmittedAt))
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
""")

write_file("scheduler/SjfStrategy.java", """
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
""")

write_file("scheduler/PriorityStrategy.java", """
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
""")

write_file("scheduler/RoundRobinStrategy.java", """
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
public class RoundRobinStrategy implements SchedulingStrategy {
    @Override
    public String getPolicyName() { return "RR"; }

    @Override
    public List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers) {
        List<BackupJob> sortedJobs = jobs.stream()
            .sorted(Comparator.comparing(BackupJob::getSubmittedAt))
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
""")

print("Scheduler Strategies created successfully.")
