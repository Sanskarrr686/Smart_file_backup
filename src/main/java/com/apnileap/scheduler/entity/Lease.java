package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
public class Lease {
    public Lease() {
        super();
    }

    public Lease(String leaseId, String fileId, String holderId, LockMode lockMode,
                 LeaseState state, Instant acquiredAt, Instant expiresAt) {
        super();
        this.leaseId = leaseId;
        this.fileId = fileId;
        this.holderId = holderId;
        this.lockMode = lockMode;
        this.state = state;
        this.acquiredAt = acquiredAt;
        this.expiresAt = expiresAt;
    }
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
