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
