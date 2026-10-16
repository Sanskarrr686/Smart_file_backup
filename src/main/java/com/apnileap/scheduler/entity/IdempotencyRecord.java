package com.apnileap.scheduler.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Data
@Builder
public class IdempotencyRecord {
    public IdempotencyRecord() {
        super();
    }

    public IdempotencyRecord(String idempotencyKey, String requestHash, String originalResponse, Instant createdAt) {
        super();
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.originalResponse = originalResponse;
        this.createdAt = createdAt;
    }
    @Id
    private String idempotencyKey;
    private String requestHash;
    @Column(columnDefinition = "TEXT")
    private String originalResponse;
    private Instant createdAt;
}
