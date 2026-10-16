// frontend/src/pages/Restore.jsx
import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLiveStream } from "../hooks/useLiveStream";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { SkeletonTable } from "../components/common/Skeleton";
import { StateMessage } from "../components/common/StateMessage";
import { useToast } from "../components/common/Toast";
import { RotateCcw, RefreshCw, Download, Plus, FileText } from "lucide-react";

export function Restore() {
  const [restores, setRestores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAuditor = user?.role === "Auditor";

  // Modal State for New Restore
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  const fetchRestores = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await api.getRestores();
      setRestores(res?.items || []);
    } catch (err) {
      if (showLoading) setError(err.message || "Failed to load restore operations.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleLiveEvent = useCallback((event) => {
    if (event.type === "restore_updated" && event.data) {
      const updated = event.data;
      setRestores((prev) => {
        const idx = prev.findIndex((r) => r.restore_id === updated.restore_id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });
    }
  }, []);

  useLiveStream(handleLiveEvent);

  useEffect(() => {
    fetchRestores(true);
  }, []);

  const handleOpenModal = async () => {
    setIsModalOpen(true);
    setModalLoading(true);
    setSelectedFileId("");
    setSelectedVersionId("");
    setAvailableVersions([]);
    try {
      const res = await api.getFiles();
      const nonFolders = (res?.items || []).filter((f) => f.type !== "folder");
      setAvailableFiles(nonFolders);
      if (nonFolders.length > 0) {
        setSelectedFileId(nonFolders[0].file_id);
        await loadVersionsForFile(nonFolders[0].file_id);
      }
    } catch (err) {
      addToast(err.message || "Failed to load files.", "error");
    } finally {
      setModalLoading(false);
    }
  };

  const loadVersionsForFile = async (fileId) => {
    try {
      const verRes = await api.getFileVersions(fileId);
      const vers = verRes?.versions || [];
      setAvailableVersions(vers);
      if (vers.length > 0) {
        setSelectedVersionId(vers[0].version_id);
      } else {
        setSelectedVersionId("");
      }
    } catch (err) {
      setAvailableVersions([]);
      setSelectedVersionId("");
    }
  };

  const handleFileChange = async (e) => {
    const newFileId = e.target.value;
    setSelectedFileId(newFileId);
    setModalLoading(true);
    await loadVersionsForFile(newFileId);
    setModalLoading(false);
  };

  const handleCreateRestore = async () => {
    if (!selectedFileId || !selectedVersionId) {
      addToast("Please select both a file and a version to restore.", "error");
      return;
    }
    setSubmittingRestore(true);
    try {
      const updatedRestore = await api.createRestore(selectedFileId, selectedVersionId);
      addToast(`Restore ${updatedRestore.restore_id} initiated and completed!`, "success");
      setRestores((prev) => [updatedRestore, ...prev]);
      setIsModalOpen(false);
    } catch (err) {
      addToast(err.message || "Failed to initiate restore request.", "error");
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handleRetry = async (restoreId) => {
    try {
      addToast(`Re-attempting restore ${restoreId}...`, "info");
      const updated = await api.retryRestore(restoreId);
      setRestores((prev) => prev.map((r) => (r.restore_id === restoreId ? updated : r)));
      addToast(`Restore ${restoreId} updated to ${updated.state}`, updated.state === "COMPLETED" ? "success" : "error");
    } catch (err) {
      addToast(err.message || "Retry attempt failed.", "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Restore Operations"
        subtitle="Track authoritative restore state machines and download restored file bytes."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {!isAuditor && (
              <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenModal}>
                New Restore Request
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => fetchRestores(true)}>
              Refresh Status
            </Button>
          </div>
        }
      />

      <Card>
        {loading ? (
          <SkeletonTable rows={4} />
        ) : error ? (
          <StateMessage type="error" message={error} onRetry={() => fetchRestores(true)} />
        ) : restores.length === 0 ? (
          <StateMessage
            title="No Active Restores"
            message="No restore operations have been initiated. Click 'New Restore Request' to choose a file and version to restore."
            action={
              !isAuditor && (
                <Button variant="primary" icon={Plus} onClick={handleOpenModal}>
                  New Restore Request
                </Button>
              )
            }
          />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restore ID</th>
                  <th>File ID</th>
                  <th>Version ID</th>
                  <th>Requested By</th>
                  <th>State</th>
                  <th>Requested Timestamp</th>
                  <th style={{ textAlign: "right" }}>Download / Action</th>
                </tr>
              </thead>
              <tbody>
                {restores.map((r) => {
                  const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false;
                  return (
                    <tr key={r.restore_id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <RotateCcw size={14} color="var(--primary)" />
                          {r.restore_id}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{r.file_id}</td>
                      <td>
                        <Badge variant="info">{r.version_id}</Badge>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.user_id}</td>
                      <td>
                        <Badge
                          variant={
                            r.state === "COMPLETED"
                              ? "success"
                              : r.state === "FAILED"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {r.state}
                        </Badge>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {new Date(r.requested_at).toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.state === "COMPLETED" ? (
                          isExpired ? (
                            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => handleRetry(r.restore_id)}>
                              Link Expired — Retry
                            </Button>
                          ) : (
                            <a
                              href={r.download_url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-primary btn-sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Download size={14} /> Download File
                            </a>
                          )
                        ) : r.state === "FAILED" ? (
                          <Button variant="danger" size="sm" icon={RefreshCw} onClick={() => handleRetry(r.restore_id)}>
                            Retry Restore
                          </Button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <RefreshCw size={12} className="spin" /> Restoring...
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Restore Selection Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Initiate New File Restore"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submittingRestore}
              disabled={modalLoading || !selectedFileId || !selectedVersionId}
              onClick={handleCreateRestore}
              icon={RotateCcw}
            >
              Trigger Restore
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
              1. Choose File to Restore
            </label>
            <select
              className="form-control"
              value={selectedFileId}
              onChange={handleFileChange}
              disabled={modalLoading || submittingRestore}
            >
              {availableFiles.map((f) => (
                <option key={f.file_id} value={f.file_id}>
                  {f.name} ({f.file_id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
              2. Choose File Version
            </label>
            <select
              className="form-control"
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              disabled={modalLoading || submittingRestore || availableVersions.length === 0}
            >
              {availableVersions.map((v) => (
                <option key={v.version_id} value={v.version_id}>
                  Version {v.version_id} ({v.state}) — {new Date(v.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

