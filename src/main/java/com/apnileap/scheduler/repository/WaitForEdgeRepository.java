package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.WaitForEdge;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitForEdgeRepository extends JpaRepository<WaitForEdge, Long> {
    void deleteByWaitingJobIdOrBlockingJobId(String waitingJobId, String blockingJobId);
}
