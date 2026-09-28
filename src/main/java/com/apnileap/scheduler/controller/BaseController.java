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
