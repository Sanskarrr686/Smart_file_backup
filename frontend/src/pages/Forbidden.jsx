// frontend/src/pages/Forbidden.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "../components/common/Button";

export function Forbidden() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        padding: "60px 20px",
        textAlign: "center",
        maxWidth: 500,
        margin: "40px auto",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          padding: 16,
          background: "var(--danger-bg)",
          borderRadius: "50%",
          color: "var(--danger)",
          marginBottom: 16,
        }}
      >
        <ShieldAlert size={48} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>403 — Access Forbidden</h2>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
        Your account role does not have authorization to view this page. Backend security guards enforce RBAC rules for all administrative endpoints.
      </p>
      <Button variant="primary" icon={ArrowLeft} onClick={() => navigate("/dashboard")}>
        Return to Dashboard
      </Button>
    </div>
  );
}
