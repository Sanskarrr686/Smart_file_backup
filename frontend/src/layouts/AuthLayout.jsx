// frontend/src/layouts/AuthLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export function AuthLayout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0f172a",
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--primary)",
              color: "white",
              marginBottom: 12,
              boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.5)",
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <h1 style={{ color: "white", fontSize: 24, fontWeight: 700 }}>
            Smart Backup System
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
            Team D BFF Enterprise Management Portal
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
