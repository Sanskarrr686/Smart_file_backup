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
