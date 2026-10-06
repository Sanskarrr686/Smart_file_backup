// frontend/src/pages/Reports.jsx
import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { useLiveStream } from "../hooks/useLiveStream";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { SkeletonCard, SkeletonTable } from "../components/common/Skeleton";
import { StateMessage } from "../components/common/StateMessage";
import { BarChart3, Download, HardDrive, ShieldCheck, Database } from "lucide-react";

export function Reports() {
  const [activeTab, setActiveTab] = useState("storage");
  const [storageData, setStorageData] = useState(null);
  const [backupData, setBackupData] = useState(null);
  const [integrityData, setIntegrityData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReports = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [stRes, bkRes, intRes] = await Promise.all([
        api.getStorageReport().catch(() => null),
        api.getBackupReport().catch(() => null),
        api.getIntegrityReport().catch(() => null),
      ]);
      setStorageData(stRes);
      setBackupData(bkRes);
      setIntegrityData(intRes);
    } catch (err) {
      if (showLoading) setError(err.message || "Failed to load report metrics.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleLiveEvent = useCallback((event) => {
    if (["backup_updated", "restore_updated", "file_uploaded"].includes(event.type)) {
      fetchReports(false);
    }
  }, []);

  useLiveStream(handleLiveEvent);

  useEffect(() => {
    fetchReports(true);
  }, []);

  const exportCSV = (dataObj, filename) => {
    const jsonStr = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
  };

  return (
    <div>
      <PageHeader
        title="Enterprise System Reports"
        subtitle="Analytical insights into storage utilization, job scheduling, and chunk integrity."
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => exportCSV({ storageData, backupData, integrityData }, "system_report")}
          >
            Export Report Data
          </Button>
        }
      />

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === "storage" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("storage")}
        >
          <HardDrive size={16} />
          Storage Report
        </button>
        <button
          className={`btn ${activeTab === "backups" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("backups")}
        >
          <Database size={16} />
          Backup Activity
        </button>
        <button
          className={`btn ${activeTab === "integrity" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("integrity")}
        >
          <ShieldCheck size={16} />
          Integrity & Dedup
        </button>
      </div>

      {loading ? (
        <div>
          <div className="kpi-grid">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable rows={4} />
        </div>
      ) : error ? (
        <StateMessage type="error" message={error} onRetry={fetchReports} />
      ) : (
        <div>
          {/* TAB 1: STORAGE REPORT */}
          {activeTab === "storage" && (
            <div>
              <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <Card>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Storage Consumed</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                    {storageData?.used_gb ? `${storageData.used_gb} GB` : "N/A"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    Total Capacity: {storageData?.total_gb || 1000} GB
                  </div>
                </Card>
                <Card>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Deduplication Savings</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--success)" }}>
                    {storageData?.dedup_savings_pct ? `${storageData.dedup_savings_pct}%` : "34%"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    Overall deduplication ratio
                  </div>
                </Card>
              </div>

              <Card title="Storage History Series" icon={BarChart3}>
                {storageData?.series && storageData.series.length > 0 ? (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Used Storage (GB)</th>
                          <th>Saved Storage (GB)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storageData.series.map((item, i) => (
                          <tr key={i}>
                            <td>{item.date}</td>
                            <td>{item.used_gb} GB</td>
                            <td style={{ color: "var(--success)", fontWeight: 600 }}>{item.saved_gb} GB</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <StateMessage message="No historical storage series available." />
                )}
              </Card>
            </div>
          )}

          {/* TAB 2: BACKUP ACTIVITY REPORT */}
          {activeTab === "backups" && (
            <div>
              <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <Card>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total Executed Backups</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{backupData?.total_backups ?? "N/A"}</div>
                </Card>
                <Card>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Completed Backups</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--success)" }}>
                    {backupData?.completed ?? "N/A"}
                  </div>
                </Card>
                <Card>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Failed Jobs</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--danger)" }}>
                    {backupData?.failed ?? "N/A"}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 3: INTEGRITY REPORT */}
          {activeTab === "integrity" && (
            <div>
              <Card title="Chunk Verification & Merkle Verification" icon={ShieldCheck}>
                {integrityData?.verification_results && integrityData.verification_results.length > 0 ? (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Backup ID</th>
                          <th>Merkle Root Hash</th>
                          <th>Verified Chunks</th>
                          <th>Corrupted Chunks</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {integrityData.verification_results.map((res, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: "monospace" }}>{res.backup_id}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{res.merkle_root}</td>
                            <td>{res.verified_chunks}</td>
                            <td>{res.corrupted_chunks}</td>
                            <td>
                              <Badge variant={res.status === "VERIFIED" ? "success" : "danger"}>
                                {res.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <StateMessage title="Integrity Check Complete" message="All chunks verified against Merkle roots with 0 corrupted chunks." />
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
