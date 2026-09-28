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

    @GetMapping
    public ApiResponse<java.util.List<BackupJob>> listJobs(HttpServletRequest request) {
        return success(jobService.listJobs(), request);
    }

    @GetMapping("/{jobId}")
    public ApiResponse<BackupJob> getJob(@PathVariable String jobId, HttpServletRequest request) {
        return success(jobService.getJob(jobId), request);
    }

    @PostMapping("/{jobId}/cancel")
    public ApiResponse<BackupJob> cancelJob(@PathVariable String jobId, HttpServletRequest request) {
        return success(jobService.cancelJob(jobId), request);
    }

    @PostMapping("/{jobId}/fail")
    public ApiResponse<BackupJob> failJob(@PathVariable String jobId, HttpServletRequest request) {
        return success(jobService.failJob(jobId, "Marked failed"), request);
    }
}
