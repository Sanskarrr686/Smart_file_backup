import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Events
write_file("events/SseService.java", """
package com.apnileap.scheduler.events;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class SseService {
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((e) -> emitters.remove(emitter));
        return emitter;
    }

    public void publishEvent(Map<String, Object> event) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(event.get("event_type").toString()).data(event));
            } catch (IOException e) {
                emitters.remove(emitter);
            }
        }
    }
}
""")

# Metrics
write_file("metrics/MetricsService.java", """
package com.apnileap.scheduler.metrics;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.LeaseState;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.LeaseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
@RequiredArgsConstructor
public class MetricsService {
    private final BackupJobRepository jobRepo;
    private final LeaseRepository leaseRepo;

    private final AtomicLong lockConflicts = new AtomicLong(0);
    private final AtomicLong expiredLeases = new AtomicLong(0);
    private final AtomicLong deadlocksDetected = new AtomicLong(0);
    private final AtomicLong deadlocksResolved = new AtomicLong(0);
    private final AtomicLong totalWaitTime = new AtomicLong(0);
    private final AtomicLong totalTurnaroundTime = new AtomicLong(0);
    private final AtomicLong completedCount = new AtomicLong(0);

    public void incrementLockConflicts() { lockConflicts.incrementAndGet(); }
    public void incrementExpiredLeases() { expiredLeases.incrementAndGet(); }
    public void incrementDeadlocksDetected() { deadlocksDetected.incrementAndGet(); }
    public void incrementDeadlocksResolved() { deadlocksResolved.incrementAndGet(); }
    
    public void recordJobCompletion(long waitMs, long turnaroundMs) {
        totalWaitTime.addAndGet(waitMs);
        totalTurnaroundTime.addAndGet(turnaroundMs);
        completedCount.incrementAndGet();
    }

    public Map<String, Object> getMetrics() {
        long queued = jobRepo.countByState(JobState.QUEUED) + jobRepo.countByState(JobState.READY);
        long active = jobRepo.countByState(JobState.RUNNING);
        long completed = jobRepo.countByState(JobState.COMPLETED);
        long failed = jobRepo.countByState(JobState.FAILED);
        long cancelled = jobRepo.countByState(JobState.CANCELLED);
        long activeLeases = leaseRepo.countByState(LeaseState.ACTIVE);
        
        long count = completedCount.get();
        double avgWait = count > 0 ? (double) totalWaitTime.get() / count : 0.0;
        double avgTurnaround = count > 0 ? (double) totalTurnaroundTime.get() / count : 0.0;

        return Map.of(
            "queue_depth", queued,
            "active_jobs", active,
            "completed_jobs", completed,
            "failed_jobs", failed,
            "cancelled_jobs", cancelled,
            "throughput", completed,
            "average_wait_time_ms", avgWait,
            "average_turnaround_time_ms", avgTurnaround,
            "worker_utilization", active > 0 ? 1.0 : 0.0,
            "lock_conflicts", lockConflicts.get(),
            "active_leases", activeLeases,
            "expired_leases", expiredLeases.get(),
            "deadlocks_detected", deadlocksDetected.get(),
            "deadlocks_resolved", deadlocksResolved.get(),
            "starvation_indicator", false
        );
    }
}
""")

print("Events, Metrics created successfully.")
