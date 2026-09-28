package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
@Data
@Builder
public class Meta {
    private String correlation_id;
    @Builder.Default
    private String api_version = "v1";
}
