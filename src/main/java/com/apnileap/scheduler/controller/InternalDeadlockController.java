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
