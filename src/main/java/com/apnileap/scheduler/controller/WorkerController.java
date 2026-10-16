package com.apnileap.scheduler.controller;

import com.apnileap.scheduler.dto.ApiResponse;
import com.apnileap.scheduler.entity.BackupJob;
import com.apnileap.scheduler.entity.Worker;
import com.apnileap.scheduler.repository.BackupJobRepository;
import com.apnileap.scheduler.repository.WorkerRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/workers")
public class WorkerController extends BaseController {
    private final BackupJobRepository jobRepo;
    private final WorkerRepository workerRepo;

    public WorkerController(BackupJobRepository jobRepo, WorkerRepository workerRepo) {
        this.jobRepo = jobRepo;
        this.workerRepo = workerRepo;
    }

    @GetMapping
    public ApiResponse<List<Worker>> listWorkers(HttpServletRequest request) {
        return success(workerRepo.findAll(), request);
    }

    @GetMapping("/{workerId}/queue")
    public ApiResponse<List<BackupJob>> getWorkerQueue(@PathVariable String workerId, HttpServletRequest request) {
        return success(jobRepo.findByAssignedWorkerId(workerId), request);
    }
}
