package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
@Data
@Builder
public class ApiResponse<T> {
    private T data;
    private Meta meta;

    public ApiResponse() {
        super();
    }

    public ApiResponse(T data, Meta meta) {
        super();
        this.data = data;
        this.meta = meta;
    }
}
