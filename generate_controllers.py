import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Base API responses
write_file("controller/BaseController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.dto.Meta;
import jakarta.servlet.http.HttpServletRequest;

public abstract class BaseController {
    protected <T> ApiResponse<T> success(T data, HttpServletRequest request) {
        String correlationId = (String) request.getAttribute("correlationId");
        return ApiResponse.<T>builder()
                .data(data)
                .meta(Meta.builder().correlation_id(correlationId).build())
                .build();
    }
}
""")

# BackupController
write_file("controller/BackupController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.service.JobService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/backup/jobs")
@RequiredArgsConstructor
public class BackupController extends BaseController {
    private final JobService jobService;

    @PostMapping
    public ApiResponse<Map<String, Object>> submitJob(
            @Valid @RequestBody BackupJobRequest requestBody,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest request) {
        String correlationId = (String) request.getAttribute("correlationId");
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new com.apnileap.scheduler.exception.BusinessException("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key is required for create operations");
        }
        Map<String, Object> response = jobService.submitJob(requestBody, correlationId, idempotencyKey);
        return success(response, request);
    }

    @GetMapping("/{jobId}")
    public ApiResponse<BackupJob> getJob(@PathVariable String jobId, HttpServletRequest request) {
        return success(jobService.getJob(jobId), request);
    }
}
""")

# WorkerController
write_file("controller/WorkerController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.repository.BackupJobRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/workers")
@RequiredArgsConstructor
public class WorkerController extends BaseController {
    private final BackupJobRepository jobRepo;

    @GetMapping("/{workerId}/queue")
    public ApiResponse<List<BackupJob>> getWorkerQueue(@PathVariable String workerId, HttpServletRequest request) {
        return success(jobRepo.findByAssignedWorkerId(workerId), request);
    }
}
""")

# MetricsController
write_file("controller/MetricsController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.metrics.MetricsService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/metrics")
@RequiredArgsConstructor
public class MetricsController extends BaseController {
    private final MetricsService metricsService;

    @GetMapping("/backup")
    public ApiResponse<Map<String, Object>> getMetrics(HttpServletRequest request) {
        return success(metricsService.getMetrics(), request);
    }
}
""")

# StreamController
write_file("controller/StreamController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.events.SseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/stream")
@RequiredArgsConstructor
public class StreamController {
    private final SseService sseService;

    @GetMapping(value = "/backup", produces = org.springframework.http.MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamEvents() {
        return sseService.subscribe();
    }
}
""")

# InternalSchedulerController
write_file("controller/InternalSchedulerController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.dto.SchedulerRunRequest;
import com.apnileap.scheduler.service.SchedulerService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/internal/v1/scheduler")
@RequiredArgsConstructor
public class InternalSchedulerController extends BaseController {
    private final SchedulerService schedulerService;

    @PostMapping("/run")
    public ApiResponse<Map<String, String>> runScheduler(
            @Valid @RequestBody SchedulerRunRequest req,
            HttpServletRequest request) {
        schedulerService.runScheduler(req.getPolicy(), req.getQuantumMs());
        return success(Map.of("status", "Scheduler run completed"), request);
    }
}
""")

# InternalLockController
write_file("controller/InternalLockController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.AcquireLockRequest;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.entity.Lease;
import com.apnileap.scheduler.lock.LockService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/internal/v1/locks")
@RequiredArgsConstructor
public class InternalLockController extends BaseController {
    private final LockService lockService;

    @PostMapping("/acquire")
    public ApiResponse<Lease> acquireLock(
            @Valid @RequestBody AcquireLockRequest req,
            HttpServletRequest request) {
        return success(lockService.acquireLock(req), request);
    }

    @DeleteMapping("/{leaseId}")
    public ApiResponse<Map<String, String>> releaseLock(
            @PathVariable String leaseId,
            HttpServletRequest request) {
        lockService.releaseLock(leaseId);
        return success(Map.of("status", "released"), request);
    }
}
""")

# InternalDeadlockController
write_file("controller/InternalDeadlockController.java", """
package com.apnileap.scheduler.controller;
import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.lock.DeadlockService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/internal/v1/deadlocks")
@RequiredArgsConstructor
public class InternalDeadlockController extends BaseController {
    private final DeadlockService deadlockService;

    @PostMapping("/analyse")
    public ApiResponse<Map<String, Object>> analyse(HttpServletRequest request) {
        return success(deadlockService.analyseAndRecover(), request);
    }
}
""")

print("Controllers created successfully.")
