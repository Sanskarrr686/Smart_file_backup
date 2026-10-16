package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
public class SchedulingDecision {
    public SchedulingDecision() {
        super();
    }

    public SchedulingDecision(String decisionId, String jobId, String workerId, String policy,
                              String algorithmVersion, Instant scheduledStart, Long estimatedWaitMs) {
        super();
        this.decisionId = decisionId;
        this.jobId = jobId;
        this.workerId = workerId;
        this.policy = policy;
        this.algorithmVersion = algorithmVersion;
        this.scheduledStart = scheduledStart;
        this.estimatedWaitMs = estimatedWaitMs;
    }
    @Id
    private String decisionId;
    private String jobId;
    private String workerId;
    private String policy;
    private String algorithmVersion;
    private Instant scheduledStart;
    private Long estimatedWaitMs;
}
