import React from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function StateMessage({
  type = "empty", // "empty" | "error" | "warning"
  title,
  message,
  onRetry,
}) {
  const isError = type === "error";
  const isWarning = type === "warning";

  return (
    <div className="state-container">
      <div className="state-icon">
        {isError ? (
          <AlertTriangle color="var(--danger)" size={36} />
        ) : isWarning ? (
          <AlertTriangle color="var(--warning)" size={36} />
        ) : (
          <Inbox size={36} color="var(--text-muted)" />
        )}
      </div>
      <h4 className="state-title">{title || (isError ? "Error Loading Data" : "No Data Found")}</h4>
      <p className="state-text">{message || (isError ? "An error occurred while communicating with the server." : "There are no records to display.")}</p>
      {onRetry && (
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
            Retry Request
          </Button>
        </div>
      )}
    </div>
  );
}

export function WarningAlert({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        color: "var(--warning)",
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <AlertTriangle size={16} />
      <span>{message}</span>
    </div>
  );
}
