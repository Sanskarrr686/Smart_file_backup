// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { useLiveStream } from "../hooks/useLiveStream";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { SkeletonCard, SkeletonTable } from "../components/common/Skeleton";
import { WarningAlert, StateMessage } from "../components/common/StateMessage";
import {
  FileText,
  Database,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HardDrive,
  Cpu,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/common/Button";

export function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      if (showLoading) setError(err.message || "Failed to load dashboard data.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleLiveEvent = useCallback((event) => {
    if (["backup_updated", "restore_updated", "file_uploaded"].includes(event.type)) {
      fetchDashboard(false);
    }
  }, []);

  useLiveStream(handleLiveEvent);

  useEffect(() => {
    fetchDashboard(true);
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          subtitle="Monitor backup activity, storage, integrity and restore operations."
        />
        <div className="kpi-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonTable rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          subtitle="Monitor backup activity, storage, integrity and restore operations."
        />
        <StateMessage
          type="error"
          title="Dashboard Unavailable"
          message={error}
          onRetry={fetchDashboard}
        />
      </div>
    );
  }

  const { stats, team_a, team_b, team_c } = data || {};

  // Partial failure check warnings
  const warnings = [];
  if (team_a && !team_a.available) {
    warnings.push("Scheduler service (Team A) data is currently unavailable.");
  }
  if (team_c && !team_c.available) {
    warnings.push("Storage and System of Record (Team C) data is currently unavailable.");
  }
  if (team_b?.deduplication_summary?.available === false) {
    warnings.push("Deduplication and integrity engine (Team B) metrics are partially unavailable.");
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Monitor backup activity, storage, integrity and restore operations."
        action={
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchDashboard}>
            Refresh Data
          </Button>
        }
      />

      {warnings.map((w, idx) => (
        <WarningAlert key={idx} message={w} />
      ))}

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <FileText size={22} />
          </div>
          <div>
            <div className="kpi-label">Total Files</div>
            <div className="kpi-value">
              {stats?.total_files?.available !== false ? stats?.total_files : "N/A"}
            </div>
            <div className="kpi-subtext">Tracked in metadata</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#f0fdf4", color: "#16a34a" }}>
            <Database size={22} />
          </div>
          <div>
            <div className="kpi-label">Total Backups</div>
            <div className="kpi-value">
              {stats?.total_backups?.available !== false ? stats?.total_backups : "N/A"}
            </div>
            <div className="kpi-subtext">
              {stats?.completed_backups?.available !== false
                ? `${stats.completed_backups} Completed`
                : "Status unavailable"}
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#fffbe6", color: "#d97706" }}>
            <Clock size={22} />
          </div>
          <div>
            <div className="kpi-label">Pending Jobs</div>
            <div className="kpi-value">
              {stats?.active_jobs?.available !== false ? stats?.active_jobs : "N/A"}
            </div>
            <div className="kpi-subtext">Scheduler queue size</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
            <HardDrive size={22} />
          </div>
          <div>
            <div className="kpi-label">Storage Used</div>
            <div className="kpi-value">
              {stats?.storage_used_gb?.available !== false ? `${stats.storage_used_gb} GB` : "N/A"}
            </div>
            <div className="kpi-subtext">
              {team_c?.storage_chart?.total_gb
                ? `of ${team_c.storage_chart.total_gb} GB total`
                : "Limit unmapped"}
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="kpi-label">Dedup Savings</div>
            <div className="kpi-value">
              {team_c?.storage_chart?.dedup_savings_pct !== undefined
                ? `${team_c.storage_chart.dedup_savings_pct}%`
                : "N/A"}
            </div>
            <div className="kpi-subtext">Storage efficiency ratio</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#f0f9ff", color: "#0284c7" }}>
            <RotateCcw size={22} />
          </div>
          <div>
            <div className="kpi-label">Restore Operations</div>
            <div className="kpi-value">
              {stats?.total_restores?.available !== false ? stats?.total_restores : "N/A"}
            </div>
            <div className="kpi-subtext">System restore requests</div>
          </div>
        </div>
      </div>

      {/* Grid Layout for Detailed Sections */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20, marginBottom: 24 }}>
        {/* Scheduler Section (Team A) */}
        <Card title="Scheduler & Queue (Team A)" icon={Cpu}>
          {team_a?.available ? (
            <div>
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: 12, background: "#f8fafc", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Active Jobs</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{team_a?.metrics?.active_jobs ?? team_a?.queue?.length ?? 0}</div>
                </div>
                <div style={{ flex: 1, padding: 12, background: "#f8fafc", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Avg Wait Time</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {team_a?.metrics?.avg_wait_time_ms ? `${team_a.metrics.avg_wait_time_ms} ms` : "N/A"}
                  </div>
                </div>
              </div>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Queued Jobs</h4>
              {team_a.queue && team_a.queue.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Job ID</th>
                        <th>File Name</th>
                        <th>State</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team_a.queue.map((job) => (
                        <tr key={job.job_id}>
                          <td style={{ fontFamily: "monospace", fontSize: 12 }}>{job.job_id}</td>
                          <td>{job.file_name}</td>
                          <td>
                            <Badge variant={job.state === "RUNNING" ? "info" : "secondary"}>
                              {job.state}
                            </Badge>
                          </td>
                          <td>{job.progress}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No active or queued jobs right now.
                </div>
              )}
            </div>
          ) : (
            <StateMessage
              type="warning"
              title="Scheduler Offline"
              message="Scheduler metrics from Team A are currently unavailable."
            />
          )}
        </Card>

        {/* Deduplication & Integrity Section (Team B) */}
        <Card title="Deduplication & Integrity (Team B)" icon={ShieldCheck}>
          {team_b?.deduplication_summary?.available ? (
            <div>
              <div style={{ padding: 16, background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--success)" }}>
                  Verified Integrity & Merkle Trees Active
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  Sample Backup ID: <code>{team_b.deduplication_summary.sample_backup_id}</code>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: 12, border: "1px solid var(--border-color)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Unique Chunks</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{team_b.deduplication_summary.unique_chunks}</div>
                </div>
                <div style={{ padding: 12, border: "1px solid var(--border-color)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Duplicate Chunks</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{team_b.deduplication_summary.duplicate_chunks}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              Engine metrics for deduplication are integrated and verified per backup on demand.
            </div>
          )}
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card title="Recent Backup Activity" icon={Database}>
        {team_c?.recent_activity && team_c.recent_activity.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Backup ID</th>
                  <th>File Name</th>
                  <th>User ID</th>
                  <th>Status</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {team_c.recent_activity.map((b) => (
                  <tr key={b.backup_id}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{b.backup_id}</td>
                    <td style={{ fontWeight: 600 }}>{b.file_name}</td>
                    <td>{b.user_id}</td>
                    <td>
                      <Badge
                        variant={
                          b.state === "COMPLETED" || b.state === "COMMITTED"
                            ? "success"
                            : b.state === "FAILED"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {b.state}
                      </Badge>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                      {new Date(b.date).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StateMessage title="No Activity" message="No recent backups recorded yet." />
        )}
      </Card>
    </div>
  );
}
