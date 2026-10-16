package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Data
@Builder
public class Worker {
    public Worker() {
        super();
    }

    public Worker(String workerId, WorkerState state, String currentJobId, Long totalBusyMs) {
        super();
        this.workerId = workerId;
        this.state = state;
        this.currentJobId = currentJobId;
        this.totalBusyMs = totalBusyMs;
    }
    @Id
    private String workerId;
    
    @Enumerated(EnumType.STRING)
    private WorkerState state;
    
    private String currentJobId;
    private Long totalBusyMs;
}
