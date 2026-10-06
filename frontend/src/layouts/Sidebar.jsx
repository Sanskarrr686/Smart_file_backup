// frontend/src/layouts/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Database,
  RotateCcw,
  BarChart3,
  ShieldAlert,
  Users,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const role = user?.role;

  const navItems = [
    {
      title: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
      roles: ["Employee", "IT Admin", "Auditor"],
    },
    {
      title: "Files",
      path: "/files",
      icon: FileText,
      roles: ["Employee", "IT Admin", "Auditor"],
    },
    {
      title: "Backups",
      path: "/backups",
      icon: Database,
      roles: ["Employee", "IT Admin"],
    },
    {
      title: "Restore",
      path: "/restore",
      icon: RotateCcw,
      roles: ["Employee", "IT Admin"],
    },
    {
      title: "Reports",
      path: "/reports",
      icon: BarChart3,
      roles: ["Employee", "IT Admin", "Auditor"],
    },
    {
      title: "Audit Log",
      path: "/audit",
      icon: ShieldAlert,
      roles: ["IT Admin", "Auditor"],
    },
    {
      title: "User Management",
      path: "/users",
      icon: Users,
      roles: ["IT Admin"],
    },
    {
      title: "Settings",
      path: "/settings",
      icon: Settings,
      roles: ["Employee", "IT Admin", "Auditor"],
    },
  ];

  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside
      style={{
        width: 240,
        backgroundColor: "var(--bg-sidebar)",
        color: "var(--text-inverse)",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        position: "sticky",
        top: 0,
        zIndex: 900,
        borderRight: "1px solid #1e293b",
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div
          style={{
            background: "var(--primary)",
            padding: 8,
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShieldCheck size={22} color="white" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>
            BackupHub
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Team D BFF Portal
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav style={{ padding: "16px 12px", flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#64748b",
            padding: "0 12px 8px 12px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Navigation
        </div>
        <ul style={{ listStyle: "none" }}>
          {filteredItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path} style={{ marginBottom: 4 }}>
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    fontWeight: 500,
                    color: isActive ? "white" : "#94a3b8",
                    backgroundColor: isActive ? "var(--bg-sidebar-active)" : "transparent",
                    transition: "all 0.15s ease",
                  })}
                >
                  <Icon size={18} />
                  <span>{item.title}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Role Footer */}
      <div
        style={{
          padding: 16,
          borderTop: "1px solid #1e293b",
          fontSize: 12,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Role Scope:</span>
        <span
          style={{
            fontWeight: 600,
            color: "white",
            background: "#1e293b",
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          {role}
        </span>
      </div>
    </aside>
  );
}
