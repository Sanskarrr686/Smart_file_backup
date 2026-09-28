package com.apnileap.scheduler.repository;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.WorkerState;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WorkerRepository extends JpaRepository<Worker, String> {
    List<Worker> findByState(WorkerState state);
}
