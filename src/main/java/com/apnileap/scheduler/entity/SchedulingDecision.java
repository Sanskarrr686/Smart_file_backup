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
