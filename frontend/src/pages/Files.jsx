// frontend/src/pages/Files.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { SkeletonTable } from "../components/common/Skeleton";
import { StateMessage } from "../components/common/StateMessage";
import { useToast } from "../components/common/Toast";
import { UploadModal } from "../components/UploadModal";
import {
  FileText,
  Folder,
  Search,
  History,
  Database,
  UploadCloud,
  HardDrive,
  Download,
} from "lucide-react";

export function Files() {
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backupLoading, setBackupLoading] = useState({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState({});

  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const isAuditor = user?.role === "Auditor";

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFiles();
      setFiles(res?.items || []);
    } catch (err) {
      setError(err.message || "Failed to fetch files list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleBackup = async (file) => {
    setBackupLoading((prev) => ({ ...prev, [file.file_id]: true }));
    try {
      const idempotencyKey = `idem_fe_${file.file_id}_${Date.now()}`;
      await api.createBackup(file.file_id, file.name, idempotencyKey);
      addToast(`Backup request triggered for '${file.name}'`, "success");
    } catch (err) {
      addToast(err.message || "Failed to trigger backup.", "error");
    } finally {
      setBackupLoading((prev) => ({ ...prev, [file.file_id]: false }));
    }
  };

  const handleGetSignedUrl = async (file) => {
    setDownloadLoading((prev) => ({ ...prev, [file.file_id]: true }));
    try {
      const res = await api.getDownloadUrl(file.file_id);
      addToast(`Generated presigned access URL for '${file.name}'`, "info");
      if (res.signed_url) {
        window.open(res.signed_url, "_blank");
      }
    } catch (err) {
      addToast(err.message || "Failed to generate presigned storage URL.", "error");
    } finally {
      setDownloadLoading((prev) => ({ ...prev, [file.file_id]: false }));
    }
  };

  const handleUploadSuccess = () => {
    fetchFiles();
  };

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "ALL" || f.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div>
      <PageHeader
        title="File Management"
        subtitle={
          user?.role === "Employee"
            ? "Upload files to shared storage & manage backups."
            : "Enterprise repository file index, shared storage & version tracking."
        }
        action={
          !isAuditor && (
            <Button
              variant="primary"
              icon={UploadCloud}
              onClick={() => setIsUploadOpen(true)}
            >
              Upload File
            </Button>
          )
        }
      />

      <Card>
        {/* Filter Bar */}
        <div className="filter-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search file name..."
              className="form-control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 160 }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All Types</option>
            <option value="file">Files</option>
            <option value="folder">Folders</option>
          </select>
        </div>

        {loading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <StateMessage type="error" message={error} onRetry={fetchFiles} />
        ) : filteredFiles.length === 0 ? (
          <StateMessage
            title="No Files Match"
            message="Try adjusting your search query or upload a new file to shared storage."
            action={
              !isAuditor && (
                <Button variant="primary" icon={UploadCloud} onClick={() => setIsUploadOpen(true)}>
                  Upload File
                </Button>
              )
            }
          />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Storage Status</th>
                  <th>Modified Date</th>
                  <th>Owner</th>
                  <th>Versions</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.file_id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                        {file.type === "folder" ? (
                          <Folder size={18} color="var(--warning)" />
                        ) : (
                          <FileText size={18} color="var(--primary)" />
                        )}
                        {file.name}
                      </div>
                    </td>
                    <td>
                      <Badge variant={file.type === "folder" ? "warning" : "info"}>
                        {file.type}
                      </Badge>
                    </td>
                    <td>{file.size_kb ? `${(file.size_kb / 1024).toFixed(2)} MB` : "N/A"}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <HardDrive size={14} color="var(--success)" />
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--success)" }}>
                          Shared Storage: Available
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {new Date(file.modified).toLocaleDateString()}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{file.owner_id}</td>
                    <td>{file.versions || 1} version(s)</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        {file.type !== "folder" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Download}
                            loading={downloadLoading[file.file_id]}
                            onClick={() => handleGetSignedUrl(file)}
                            title="Get shared access URL for Team B processing"
                          >
                            Access
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={History}
                          onClick={() => navigate(`/files/${file.file_id}/versions`)}
                        >
                          Versions
                        </Button>
                        {!isAuditor && file.type !== "folder" && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={Database}
                            loading={backupLoading[file.file_id]}
                            onClick={() => handleBackup(file)}
                          >
                            Backup
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
