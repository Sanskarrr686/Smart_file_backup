package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
@Data
@Builder
public class ApiResponse<T> {
    private T data;
    private Meta meta;
}
