package com.apnileap.scheduler.dto;
import com.apnileap.scheduler.entity.BackupType;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class BackupJobRequest {
    @NotBlank @JsonProperty("job_id") private String jobId;
    @NotBlank @JsonProperty("backup_id") private String backupId;
    @NotBlank @JsonProperty("user_id") private String userId;
    @NotBlank @JsonProperty("file_id") private String fileId;
    @NotNull @JsonProperty("backup_type") private BackupType backupType;
    @JsonProperty("source_path") private String sourcePath;
    @NotNull private Integer priority;
    @NotNull @JsonProperty("estimated_duration_ms") private Long estimatedDurationMs;
    @JsonProperty("preferred_window") private String preferredWindow;
}
