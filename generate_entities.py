import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Enums
write_file("entity/BackupType.java", """
package com.apnileap.scheduler.entity;
public enum BackupType { BACKUP, RESTORE }
""")

write_file("entity/JobState.java", """
package com.apnileap.scheduler.entity;
public enum JobState { QUEUED, READY, WAITING_FOR_LOCK, RUNNING, COMPLETED, CANCELLED, FAILED, REJECTED }
""")

write_file("entity/WorkerState.java", """
package com.apnileap.scheduler.entity;
public enum WorkerState { AVAILABLE, BUSY, OFFLINE }
""")

write_file("entity/LockMode.java", """
package com.apnileap.scheduler.entity;
public enum LockMode { EXCLUSIVE }
""")

write_file("entity/LeaseState.java", """
package com.apnileap.scheduler.entity;
public enum LeaseState { ACTIVE, RELEASED, EXPIRED }
""")

# Entities
write_file("entity/BackupJob.java", """
package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BackupJob {
    @Id
    private String jobId;
    private String backupId;
    private String userId;
    private String fileId;
    
    @Enumerated(EnumType.STRING)
    private BackupType backupType;
    
    private Integer priority;
    private Long estimatedDurationMs;
    private Long remainingDurationMs;
    
    @Enumerated(EnumType.STRING)
    private JobState state;
    
    private Instant submittedAt;
    private Instant startedAt;
    private Instant completedAt;
    
    private String correlationId;
    
    @Column(unique = true)
    private String idempotencyKey;
    
    private String assignedWorkerId;
    private String leaseId;
}
""")

write_file("entity/Worker.java", """
package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Worker {
    @Id
    private String workerId;
    
    @Enumerated(EnumType.STRING)
    private WorkerState state;
    
    private String currentJobId;
    private Long totalBusyMs;
}
""")

write_file("entity/Lease.java", """
package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Lease {
    @Id
    private String leaseId;
    
    private String fileId;
    private String holderId;
    
    @Enumerated(EnumType.STRING)
    private LockMode lockMode;
    
    @Enumerated(EnumType.STRING)
    private LeaseState state;
    
    private Instant acquiredAt;
    private Instant expiresAt;
}
""")

write_file("entity/SchedulingDecision.java", """
package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SchedulingDecision {
    @Id
    private String decisionId;
    private String jobId;
    private String workerId;
    private String policy;
    private String algorithmVersion;
    private Instant scheduledStart;
    private Long estimatedWaitMs;
}
""")

write_file("entity/IdempotencyRecord.java", """
package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IdempotencyRecord {
    @Id
    private String idempotencyKey;
    private String requestHash;
    @Column(columnDefinition = "TEXT")
    private String originalResponse;
    private Instant createdAt;
}
""")

write_file("entity/WaitForEdge.java", """
package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WaitForEdge {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String waitingJobId;
    private String blockingJobId;
}
""")

# DTOs
write_file("dto/Meta.java", """
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
""")

write_file("dto/ApiResponse.java", """
package com.apnileap.scheduler.dto;
import lombok.Builder;
import lombok.Data;
@Data
@Builder
public class ApiResponse<T> {
    private T data;
    private Meta meta;
}
""")

write_file("dto/ApiErrorResponse.java", """
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
""")

write_file("dto/BackupJobRequest.java", """
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
""")

write_file("dto/AcquireLockRequest.java", """
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
""")

write_file("dto/SchedulerRunRequest.java", """
package com.apnileap.scheduler.dto;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SchedulerRunRequest {
    @NotBlank private String policy;
    @JsonProperty("quantum_ms") private Long quantumMs;
}
""")

print("Entities and DTOs created successfully.")
