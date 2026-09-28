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
