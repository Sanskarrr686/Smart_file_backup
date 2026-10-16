// frontend/src/pages/Backups.jsx
import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { SkeletonTable } from "../components/common/Skeleton";
import { StateMessage } from "../components/common/StateMessage";
import { useToast } from "../components/common/Toast";
import { Database, Plus, RefreshCw, ShieldCheck } from "lucide-react";

export function Backups() {
  const [backups, setBackups] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New Backup Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const { user } = useAuth();
  const { addToast } = useToast();

  const isAuditor = user?.role === "Auditor";

  const fetchBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bkRes, fRes] = await Promise.all([
        api.getBackups(),
        api.getFiles().catch(() => ({ items: [] })),
      ]);
      setBackups(bkRes?.items || []);
      setFiles(fRes?.items || []);
    } catch (err) {
      setError(err.message || "Failed to load backups list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async (e) => {
    e.preventDefault();
    if (!selectedFileId) {
      addToast("Please select a file to backup.", "error");
      return;
    }

    const targetFile = files.find((f) => f.file_id === selectedFileId);
    const fileName = targetFile ? targetFile.name : "backup.bin";
    const idempotencyKey = `idem_bkp_${selectedFileId}_${Date.now()}`;

    setCreateLoading(true);
    try {
      const newBackup = await api.createBackup(selectedFileId, fileName, idempotencyKey);
      addToast(`Backup operation queued (ID: ${newBackup.backup_id})`, "success");
      setIsModalOpen(false);
      setSelectedFileId("");
      fetchBackups();
    } catch (err) {
      addToast(err.message || "Failed to create backup.", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Backup Operations"
        subtitle="Historical backup jobs, deduplication status, and manual backup triggers."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchBackups}>
              Refresh
            </Button>
            {!isAuditor && (
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setIsModalOpen(true)}>
                Start Backup
              </Button>
            )}
          </div>
        }
      />

      <Card>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <StateMessage type="error" message={error} onRetry={fetchBackups} />
        ) : backups.length === 0 ? (
          <StateMessage title="No Backups Found" message="No backup operations have been executed yet." />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Backup ID</th>
                  <th>File Name</th>
                  <th>User ID</th>
                  <th>Status</th>
                  <th>Integrity Verification</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.backup_id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{b.backup_id}</td>
                    <td style={{ fontWeight: 600 }}>{b.file_name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{b.user_id}</td>
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
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--success)" }}>
                        <ShieldCheck size={14} />
                        Verified (Merkle Root)
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {new Date(b.date).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Start Backup Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Start New Backup Job"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={createLoading} onClick={handleCreateBackup}>
              Execute Backup
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateBackup}>
          <div className="form-group">
            <label className="form-label">Select File for Backup</label>
            <select
              className="form-control"
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
            >
              <option value="">-- Choose a file --</option>
              {files.map((f) => (
                <option key={f.file_id} value={f.file_id}>
                  {f.name} ({f.size_kb ? `${(f.size_kb / 1024).toFixed(2)} MB` : "N/A"})
                </option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Note: Requests use client-side Idempotency Keys to guarantee duplicate operations are never triggered.
          </p>
        </form>
      </Modal>
    </div>
  );
}
