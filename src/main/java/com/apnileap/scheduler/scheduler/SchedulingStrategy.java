package com.apnileap.scheduler.scheduler;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.entity.SchedulingDecision;
import java.util.List;

public interface SchedulingStrategy {
    String getPolicyName();
    List<SchedulingDecision> schedule(List<BackupJob> jobs, List<Worker> workers);
}
