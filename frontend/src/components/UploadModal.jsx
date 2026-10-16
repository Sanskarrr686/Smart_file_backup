// frontend/src/components/UploadModal.jsx
import React, { useState, useRef } from "react";
import { Modal } from "./common/Modal";
import { Button } from "./common/Button";
import { api } from "../services/api";
import { useToast } from "./common/Toast";
import {
  UploadCloud,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  HardDrive,
  ShieldCheck,
  Server,
  RefreshCw,
} from "lucide-react";

export function UploadModal({ isOpen, onClose, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadState, setUploadState] = useState("IDLE"); // IDLE | UPLOADING | SUCCESS | ERROR
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(1); // 1: Storage Upload, 2: Team C Metadata Reg, 3: Completed
  const [errorMessage, setErrorMessage] = useState(null);
  const [uploadedData, setUploadedData] = useState(null);

  const fileInputRef = useRef(null);
  const { addToast } = useToast();

  const resetState = () => {
    setSelectedFile(null);
    setUploadState("IDLE");
    setProgress(0);
    setCurrentStep(1);
    setErrorMessage(null);
    setUploadedData(null);
  };

  const handleClose = () => {
    if (uploadState === "UPLOADING") return; // Prevent closing while upload in progress
    resetState();
    onClose();
  };

  const validateAndSetFile = (file) => {
    if (!file) return;
    if (file.size === 0) {
      addToast("Selected file is empty (0 bytes).", "error");
      return;
    }
    const maxBytes = 100 * 1024 * 1024; // 100MB
    if (file.size > maxBytes) {
      addToast("File size exceeds 100MB limit.", "error");
      return;
    }
    setSelectedFile(file);
    setErrorMessage(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState("UPLOADING");
    setProgress(20);
    setCurrentStep(1);
    setErrorMessage(null);

    const idempotencyKey = `idem_fe_up_${Date.now()}`;

    try {
      // Simulate storage progress
      setTimeout(() => setProgress(50), 300);
      setTimeout(() => {
        setProgress(75);
        setCurrentStep(2); // Metadata registration
      }, 600);

      const data = await api.uploadFile(selectedFile, idempotencyKey);

      setProgress(100);
      setCurrentStep(3);
      setUploadedData(data);
      setUploadState("SUCCESS");
      addToast(`File '${selectedFile.name}' successfully uploaded & registered!`, "success");

      if (onSuccess) {
        onSuccess(data);
      }
    } catch (err) {
      setUploadState("ERROR");
      setErrorMessage(err.message || "File upload failed.");
      addToast(err.message || "File upload failed.", "error");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload File to Shared Storage"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, width: "100%" }}>
          {uploadState === "SUCCESS" ? (
            <Button variant="primary" onClick={handleClose}>
              Done
            </Button>
          ) : uploadState === "ERROR" ? (
            <>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" icon={RefreshCw} onClick={handleUpload}>
                Retry Upload
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={uploadState === "UPLOADING"}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={UploadCloud}
                loading={uploadState === "UPLOADING"}
                disabled={!selectedFile || uploadState === "UPLOADING"}
                onClick={handleUpload}
              >
                {uploadState === "UPLOADING" ? "Uploading..." : "Start Upload"}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div style={{ minWidth: 460 }}>
        {uploadState === "IDLE" && !selectedFile && (
          <div
            className={`dropzone ${isDragActive ? "active" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-icon">
              <UploadCloud size={24} />
            </div>
            <div>
              <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                Drag & drop your file here
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Supports zip, pdf, csv, raw data files up to 100MB
              </p>
            </div>
            <Button variant="secondary" size="sm" type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Choose File
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>
        )}

        {selectedFile && uploadState === "IDLE" && (
          <div className="file-preview-card">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ padding: 10, borderRadius: 8, background: "var(--primary-light)", color: "var(--primary)" }}>
                <FileText size={24} />
              </div>
              <div>
                <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>
                  {selectedFile.name}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Size: {formatFileSize(selectedFile.size)} • Type: {selectedFile.type || "binary/file"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              title="Remove file"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {uploadState === "UPLOADING" && (
          <div style={{ padding: "12px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Uploading {selectedFile?.name}...</span>
              <span style={{ fontWeight: 600, color: "var(--primary)", fontSize: 13 }}>{progress}%</span>
            </div>

            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            </div>

            <div className="upload-steps">
              <div className={`upload-step ${currentStep >= 1 ? (currentStep > 1 ? "completed" : "active") : ""}`}>
                {currentStep > 1 ? <CheckCircle size={16} /> : <HardDrive size={16} />}
                <span>Step 1: Uploading bytes to Shared Object Storage</span>
              </div>
              <div className={`upload-step ${currentStep >= 2 ? (currentStep > 2 ? "completed" : "active") : ""}`}>
                {currentStep > 2 ? <CheckCircle size={16} /> : <Server size={16} />}
                <span>Step 2: Registering storage reference with Team C Metadata Service</span>
              </div>
            </div>
          </div>
        )}

        {uploadState === "SUCCESS" && uploadedData && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ display: "inline-flex", padding: 12, borderRadius: "50%", background: "var(--success-bg)", color: "var(--success)", marginBottom: 12 }}>
              <CheckCircle size={36} />
            </div>
            <h4 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              File Upload Completed
            </h4>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              '{uploadedData.name}' is now safely stored in shared backup storage and accessible across teams.
            </p>

            <div style={{ textAlign: "left", background: "var(--bg-main)", padding: 14, borderRadius: 8, border: "1px solid var(--border-color)", fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--success)", fontWeight: 600 }}>
                <ShieldCheck size={16} />
                <span>Shared Storage Integration Verified</span>
              </div>
              <div style={{ color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div><strong>File ID:</strong> {uploadedData.file_id}</div>
                <div><strong>Provider:</strong> {uploadedData.storage_reference?.provider || "minio"}</div>
                <div><strong>Bucket:</strong> {uploadedData.storage_reference?.bucket || "backup-files"}</div>
                <div><strong>Storage Key:</strong> <code style={{ fontSize: 11, background: "#e2e8f0", padding: "1px 4px", borderRadius: 4 }}>{uploadedData.storage_reference?.key}</code></div>
                {uploadedData.checksum && <div><strong>Checksum:</strong> <code style={{ fontSize: 11 }}>{uploadedData.checksum}</code></div>}
              </div>
            </div>
          </div>
        )}

        {uploadState === "ERROR" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ display: "inline-flex", padding: 12, borderRadius: "50%", background: "var(--danger-bg)", color: "var(--danger)", marginBottom: 12 }}>
              <AlertCircle size={36} />
            </div>
            <h4 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              Upload Process Failed
            </h4>
            <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 16, padding: "8px 12px", background: "var(--danger-bg)", borderRadius: 6 }}>
              {errorMessage}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Check your network connection and shared storage status, then click 'Retry Upload'.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
