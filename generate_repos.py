import os

base_dir = r"c:\Users\dadit\Downloads\Team-A_mini_project\team-a-scheduler\src\main\java\com\apnileap\scheduler"

def write_file(subpath, content):
    full_path = os.path.join(base_dir, subpath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Repositories
write_file("repository/BackupJobRepository.java", """
package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BackupJobRepository extends JpaRepository<BackupJob, String> {
    List<BackupJob> findByState(JobState state);
    Optional<BackupJob> findByIdempotencyKey(String idempotencyKey);
    List<BackupJob> findByAssignedWorkerId(String workerId);
    long countByState(JobState state);
}
""")

write_file("repository/WorkerRepository.java", """
package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.WorkerState;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WorkerRepository extends JpaRepository<Worker, String> {
    List<Worker> findByState(WorkerState state);
}
""")

write_file("repository/LeaseRepository.java", """
package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.Lease;
import com.apnileap.scheduler.entity.LeaseState;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface LeaseRepository extends JpaRepository<Lease, String> {
    Optional<Lease> findByFileIdAndState(String fileId, LeaseState state);
    List<Lease> findByExpiresAtBeforeAndState(Instant now, LeaseState state);
    long countByState(LeaseState state);
}
""")

write_file("repository/IdempotencyRecordRepository.java", """
package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.IdempotencyRecord;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, String> {
}
""")

write_file("repository/WaitForEdgeRepository.java", """
package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.WaitForEdge;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitForEdgeRepository extends JpaRepository<WaitForEdge, Long> {
    void deleteByWaitingJobIdOrBlockingJobId(String waitingJobId, String blockingJobId);
}
""")

write_file("repository/SchedulingDecisionRepository.java", """
package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.SchedulingDecision;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchedulingDecisionRepository extends JpaRepository<SchedulingDecision, String> {
}
""")

# Exceptions
write_file("exception/GlobalExceptionHandler.java", """
package com.apnileap.scheduler.exception;
import com.apnileap.scheduler.dto.ApiErrorResponse;
import com.apnileap.scheduler.dto.Meta;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String correlationId = (String) request.getAttribute("correlationId");
        ApiErrorResponse.ErrorDetail error = ApiErrorResponse.ErrorDetail.builder()
                .code("VALIDATION_ERROR")
                .message("Validation failed")
                .details(ex.getBindingResult().getFieldErrors().stream()
                        .map(err -> err.getField() + ": " + err.getDefaultMessage())
                        .collect(Collectors.toList()))
                .build();
        return buildResponse(HttpStatus.BAD_REQUEST, error, correlationId);
    }
    
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiErrorResponse> handleBusinessException(BusinessException ex, HttpServletRequest request) {
        String correlationId = (String) request.getAttribute("correlationId");
        ApiErrorResponse.ErrorDetail error = ApiErrorResponse.ErrorDetail.builder()
                .code(ex.getCode())
                .message(ex.getMessage())
                .build();
        return buildResponse(HttpStatus.CONFLICT, error, correlationId);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
        String correlationId = (String) request.getAttribute("correlationId");
        ApiErrorResponse.ErrorDetail error = ApiErrorResponse.ErrorDetail.builder()
                .code("INTERNAL_SERVER_ERROR")
                .message(ex.getMessage())
                .build();
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, error, correlationId);
    }
    
    private ResponseEntity<ApiErrorResponse> buildResponse(HttpStatus status, ApiErrorResponse.ErrorDetail error, String correlationId) {
        return ResponseEntity.status(status).body(ApiErrorResponse.builder()
                .error(error)
                .meta(Meta.builder().correlation_id(correlationId).build())
                .build());
    }
}
""")

write_file("exception/BusinessException.java", """
package com.apnileap.scheduler.exception;
import lombok.Getter;
@Getter
public class BusinessException extends RuntimeException {
    private final String code;
    public BusinessException(String code, String message) {
        super(message);
        this.code = code;
    }
}
""")

# Config
write_file("config/WebConfig.java", """
package com.apnileap.scheduler.config;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.util.UUID;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                String correlationId = request.getHeader("X-Correlation-ID");
                if (correlationId == null || correlationId.isBlank()) {
                    correlationId = UUID.randomUUID().toString();
                }
                request.setAttribute("correlationId", correlationId);
                response.setHeader("X-Correlation-ID", correlationId);
                return true;
            }
        });
    }
}
""")

# Mapper
write_file("mapper/JobMapper.java", """
package com.apnileap.scheduler.mapper;
import com.apnileap.scheduler.dto.BackupJobRequest;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.JobState;
import org.springframework.stereotype.Component;
import java.time.Instant;

@Component
public class JobMapper {
    public BackupJob toEntity(BackupJobRequest request, String correlationId, String idempotencyKey) {
        return BackupJob.builder()
                .jobId(request.getJobId())
                .backupId(request.getBackupId())
                .userId(request.getUserId())
                .fileId(request.getFileId())
                .backupType(request.getBackupType())
                .priority(request.getPriority())
                .estimatedDurationMs(request.getEstimatedDurationMs())
                .remainingDurationMs(request.getEstimatedDurationMs())
                .state(JobState.QUEUED)
                .submittedAt(Instant.now())
                .correlationId(correlationId)
                .idempotencyKey(idempotencyKey)
                .build();
    }
}
""")

print("Repos, Exceptions, Config, Mapper created successfully.")
