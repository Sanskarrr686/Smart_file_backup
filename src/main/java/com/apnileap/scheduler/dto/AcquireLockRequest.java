package com.apnileap.scheduler.dto;
import com.apnileap.scheduler.entity.LockMode;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AcquireLockRequest {
    @NotBlank @JsonProperty("file_id") private String fileId;
    @NotBlank @JsonProperty("holder_id") private String holderId;
    @NotNull @JsonProperty("lock_mode") private LockMode lockMode;
    @JsonProperty("lease_timeout_ms") private Long leaseTimeoutMs;
}
