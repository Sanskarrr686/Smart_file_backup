package com.apnileap.scheduler.dto;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SchedulerRunRequest {
    @NotBlank private String policy;
    @JsonProperty("quantum_ms") private Long quantumMs;
}
