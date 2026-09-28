package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.SchedulingDecision;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchedulingDecisionRepository extends JpaRepository<SchedulingDecision, String> {
}
