package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Data
@Builder
public class WaitForEdge {
    public WaitForEdge() {
        super();
    }

    public WaitForEdge(Long id, String waitingJobId, String blockingJobId) {
        super();
        this.id = id;
        this.waitingJobId = waitingJobId;
        this.blockingJobId = blockingJobId;
    }
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String waitingJobId;
    private String blockingJobId;
}
