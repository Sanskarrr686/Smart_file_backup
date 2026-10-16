// frontend/src/pages/FileVersions.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { ArrowLeft, RotateCcw, FileCheck, Hash } from "lucide-react";

export function FileVersions() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [fileDetails, setFileDetails] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore Modal State
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const isAuditor = user?.role === "Auditor";

  const fetchVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fileRes, verRes] = await Promise.all([
        api.getFile(fileId).catch(() => null),
        api.getFileVersions(fileId),
      ]);
      setFileDetails(fileRes);
      setVersions(verRes?.versions || []);
    } catch (err) {
      if (err.status === 403) {
        setError("You do not have permission to view versions for this file.");
      } else {
        setError(err.message || "Failed to load file versions.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, [fileId]);

  const handleConfirmRestore = async () => {
    if (!selectedVersion) return;
    setRestoreLoading(true);
    try {
      const restoreOp = await api.createRestore(fileId, selectedVersion.version_id);
      addToast(`Restore initiated successfully (ID: ${restoreOp.restore_id})`, "success");
      setSelectedVersion(null);
      navigate("/restore");
    } catch (err) {
      addToast(err.message || "Restore request failed.", "error");
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`File Versions — ${fileDetails?.name || fileId}`}
        subtitle={`Inspect historical states, checksums, and trigger restores.`}
        action={
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate("/files")}>
            Back to Files
          </Button>
        }
      />

      {loading ? (
        <SkeletonTable rows={4} />
      ) : error ? (
        <StateMessage type="error" message={error} onRetry={fetchVersions} />
      ) : (
        <div>
          {/* File Metadata Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
            <Card>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>File ID</div>
              <div style={{ fontWeight: 600, fontFamily: "monospace", marginTop: 4 }}>{fileId}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Owner</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{fileDetails?.owner_id || "System"}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Current Size</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {fileDetails?.size_kb ? `${(fileDetails.size_kb / 1024).toFixed(2)} MB` : "N/A"}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total Versions</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{versions.length}</div>
            </Card>
          </div>

          {/* Versions Table */}
          <Card title="Historical Versions" icon={FileCheck}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Version ID</th>
                    <th>Status</th>
                    <th>Size</th>
                    <th>Checksum (SHA)</th>
                    <th>Created Timestamp</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((ver) => (
                    <tr key={ver.version_id}>
                      <td style={{ fontWeight: 700, fontFamily: "monospace" }}>{ver.version_id}</td>
                      <td>
                        <Badge variant={ver.state === "CURRENT" ? "success" : "secondary"}>
                          {ver.state}
                        </Badge>
                      </td>
                      <td>{ver.size_kb ? `${(ver.size_kb / 1024).toFixed(2)} MB` : "N/A"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Hash size={12} />
                          {ver.checksum || "a1b2c3d4"}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {new Date(ver.created_at).toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!isAuditor && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={RotateCcw}
                            onClick={() => setSelectedVersion(ver)}
                          >
                            Restore
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      <Modal
        isOpen={!!selectedVersion}
        onClose={() => setSelectedVersion(null)}
        title="Confirm File Restore"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedVersion(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={restoreLoading} onClick={handleConfirmRestore}>
              Confirm Restore
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 12 }}>
          This will restore the selected file version (<strong>{selectedVersion?.version_id}</strong>) for file <strong>{fileDetails?.name || fileId}</strong>.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Do you want to continue with this restore request?
        </p>
      </Modal>
    </div>
  );
}
