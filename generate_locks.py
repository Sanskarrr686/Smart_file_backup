import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Lock
write_file("lock/LockService.java", """
package com.apnileap.scheduler.lock;
import com.apnileap.scheduler.dto.AcquireLockRequest;
import com.apnileap.scheduler.entity.Lease;
import com.apnileap.scheduler.entity.LeaseState;
import com.apnileap.scheduler.entity.LockMode;
import com.apnileap.scheduler.entity.WaitForEdge;
import com.apnileap.scheduler.exception.BusinessException;
import com.apnileap.scheduler.metrics.MetricsService;
import com.apnileap.scheduler.repository.LeaseRepository;
import com.apnileap.scheduler.repository.WaitForEdgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LockService {
    private final LeaseRepository leaseRepo;
    private final WaitForEdgeRepository edgeRepo;
    private final MetricsService metricsService;
    
    @Value("${scheduler.lease.default-timeout-ms:30000}")
    private long defaultTimeoutMs;

    @Transactional
    public Lease acquireLock(AcquireLockRequest req) {
        Optional<Lease> existing = leaseRepo.findByFileIdAndState(req.getFileId(), LeaseState.ACTIVE);
        if (existing.isPresent()) {
            Lease act = existing.get();
            if (act.getExpiresAt().isBefore(Instant.now())) {
                act.setState(LeaseState.EXPIRED);
                leaseRepo.save(act);
                metricsService.incrementExpiredLeases();
            } else {
                metricsService.incrementLockConflicts();
                edgeRepo.save(WaitForEdge.builder()
                        .waitingJobId(req.getHolderId())
                        .blockingJobId(act.getHolderId())
                        .build());
                throw new BusinessException("LOCK_CONFLICT", "File is already leased to " + act.getHolderId());
            }
        }
        
        long timeout = req.getLeaseTimeoutMs() != null ? req.getLeaseTimeoutMs() : defaultTimeoutMs;
        Lease lease = Lease.builder()
                .leaseId(UUID.randomUUID().toString())
                .fileId(req.getFileId())
                .holderId(req.getHolderId())
                .lockMode(req.getLockMode())
                .state(LeaseState.ACTIVE)
                .acquiredAt(Instant.now())
                .expiresAt(Instant.now().plusMillis(timeout))
                .build();
        return leaseRepo.save(lease);
    }

    @Transactional
    public void releaseLock(String leaseId) {
        leaseRepo.findById(leaseId).ifPresent(lease -> {
            lease.setState(LeaseState.RELEASED);
            leaseRepo.save(lease);
            edgeRepo.deleteByWaitingJobIdOrBlockingJobId(lease.getHolderId(), lease.getHolderId());
        });
    }

    @Scheduled(fixedRate = 5000)
    @Transactional
    public void expireLeases() {
        List<Lease> expired = leaseRepo.findByExpiresAtBeforeAndState(Instant.now(), LeaseState.ACTIVE);
        for (Lease l : expired) {
            l.setState(LeaseState.EXPIRED);
            leaseRepo.save(l);
            metricsService.incrementExpiredLeases();
            edgeRepo.deleteByWaitingJobIdOrBlockingJobId(l.getHolderId(), l.getHolderId());
        }
    }
}
""")

# Deadlock
write_file("lock/DeadlockService.java", """
package com.apnileap.scheduler.lock;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import com.apnileap.scheduler.entity.WaitForEdge;
import com.apnileap.scheduler.events.SseService;
import com.apnileap.scheduler.metrics.MetricsService;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.WaitForEdgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeadlockService {
    private final WaitForEdgeRepository edgeRepo;
    private final BackupJobRepository jobRepo;
    private final MetricsService metricsService;
    private final SseService sseService;

    @Transactional
    public Map<String, Object> analyseAndRecover() {
        List<WaitForEdge> edges = edgeRepo.findAll();
        Map<String, List<String>> graph = new HashMap<>();
        for (WaitForEdge e : edges) {
            graph.computeIfAbsent(e.getWaitingJobId(), k -> new ArrayList<>()).add(e.getBlockingJobId());
        }
        
        List<String> cycle = findCycle(graph);
        if (cycle.isEmpty()) {
            return Map.of("cycle_detected", false);
        }
        
        metricsService.incrementDeadlocksDetected();
        
        List<BackupJob> cycleJobs = jobRepo.findAllById(cycle);
        
        // Priority: cancel lowest priority. If tie, cancel newest.
        BackupJob toCancel = cycleJobs.stream()
                .min(Comparator.comparing(BackupJob::getPriority)
                        .thenComparing(BackupJob::getSubmittedAt, Comparator.reverseOrder()))
                .orElse(null);
                
        if (toCancel != null) {
            toCancel.setState(JobState.CANCELLED);
            toCancel.setCompletedAt(Instant.now());
            jobRepo.save(toCancel);
            
            edgeRepo.deleteByWaitingJobIdOrBlockingJobId(toCancel.getJobId(), toCancel.getJobId());
            metricsService.incrementDeadlocksResolved();
            
            sseService.publishEvent(Map.of(
                    "event_type", "DEADLOCK_RESOLVED",
                    "job_id", toCancel.getJobId(),
                    "state", "CANCELLED",
                    "timestamp", Instant.now().toString(),
                    "correlation_id", toCancel.getCorrelationId() != null ? toCancel.getCorrelationId() : "sys"
            ));
        }
        
        return Map.of(
                "cycle_detected", true,
                "cycle", cycle,
                "recovered_by_cancelling", toCancel != null ? toCancel.getJobId() : "none"
        );
    }
    
    private List<String> findCycle(Map<String, List<String>> graph) {
        Set<String> visited = new HashSet<>();
        Set<String> recStack = new HashSet<>();
        Map<String, String> parent = new HashMap<>();
        
        for (String node : graph.keySet()) {
            if (!visited.contains(node)) {
                List<String> cycle = dfs(node, graph, visited, recStack, parent);
                if (!cycle.isEmpty()) return cycle;
            }
        }
        return Collections.emptyList();
    }
    
    private List<String> dfs(String node, Map<String, List<String>> graph, Set<String> visited, Set<String> recStack, Map<String, String> parent) {
        visited.add(node);
        recStack.add(node);
        
        for (String neighbor : graph.getOrDefault(node, Collections.emptyList())) {
            if (!visited.contains(neighbor)) {
                parent.put(neighbor, node);
                List<String> cycle = dfs(neighbor, graph, visited, recStack, parent);
                if (!cycle.isEmpty()) return cycle;
            } else if (recStack.contains(neighbor)) {
                List<String> cycle = new ArrayList<>();
                cycle.add(neighbor);
                String curr = node;
                while (curr != null && !curr.equals(neighbor)) {
                    cycle.add(curr);
                    curr = parent.get(curr);
                }
                cycle.add(neighbor);
                Collections.reverse(cycle);
                return cycle;
            }
        }
        recStack.remove(node);
        return Collections.emptyList();
    }
}
""")

print("Lock and Deadlock created successfully.")
