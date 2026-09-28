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
