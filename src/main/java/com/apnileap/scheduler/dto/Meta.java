package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
@Data
@Builder
public class Meta {
    private String correlation_id;
    @Builder.Default
    private String api_version = "v1";

    public Meta() {
        super();
        this.api_version = "v1";
    }

    public Meta(String correlation_id, String api_version) {
        super();
        this.correlation_id = correlation_id;
        this.api_version = api_version != null ? api_version : "v1";
    }
}
