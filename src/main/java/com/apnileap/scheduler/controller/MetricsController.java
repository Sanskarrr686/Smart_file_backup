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
