package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
import java.util.List;
@Data
@Builder
public class ApiErrorResponse {
    private ErrorDetail error;
    private Meta meta;
    
    @Data
    @Builder
    public static class ErrorDetail {
        private String code;
        private String message;
        private List<String> details;
    }
}
