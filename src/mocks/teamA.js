// src/mocks/teamA.js
// Stands in for Team A (Backup Job Scheduler).

const queue = [
  { job_id: "job_101", file_name: "quarterly.docx", state: "RUNNING", progress: 62, queue_position: 0 },
  { job_id: "job_102", file_name: "assets.zip", state: "QUEUED", progress: 0, queue_position: 1 },
];

const metrics = {
  active_jobs: 2,
  avg_wait_time_ms: 850,
  throughput_per_min: 12,
};

module.exports = { queue, metrics };
