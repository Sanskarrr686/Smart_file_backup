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
