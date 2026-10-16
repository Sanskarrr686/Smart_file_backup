package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
import java.util.List;
@Data
@Builder
public class ApiErrorResponse {
    private ErrorDetail error;
    private Meta meta;

    public ApiErrorResponse() {
        super();
    }

    public ApiErrorResponse(ErrorDetail error, Meta meta) {
        super();
        this.error = error;
        this.meta = meta;
    }

    @Data
    @Builder
    public static class ErrorDetail {
        private String code;
        private String message;
        private List<String> details;

        public ErrorDetail() {
            super();
        }

        public ErrorDetail(String code, String message, List<String> details) {
            super();
            this.code = code;
            this.message = message;
            this.details = details;
        }
    }
}
