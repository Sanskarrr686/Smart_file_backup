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
