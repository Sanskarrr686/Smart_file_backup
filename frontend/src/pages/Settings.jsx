// frontend/src/pages/Settings.jsx
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { useToast } from "../components/common/Toast";
import { User, KeyRound, LogOut, Shield } from "lucide-react";

export function Settings() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword || !newPassword) {
      addToast("Please fill in both current and new password.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast("New password and confirm password do not match.", "error");
      return;
    }

    if (newPassword.length < 6) {
      addToast("New password must be at least 6 characters long.", "error");
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      addToast("Password changed successfully!", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      addToast(err.message || "Failed to change password.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Account Settings"
        subtitle="Manage your profile information and update your authentication password."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        {/* User Profile Overview */}
        <Card title="User Profile Details" icon={User}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Full Name</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{user?.name || "N/A"}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Username / ID</div>
              <div style={{ fontSize: 14, fontFamily: "monospace", color: "var(--text-primary)" }}>
                {user?.username} ({user?.user_id})
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Assigned Role</div>
              <Badge variant={user?.role === "IT Admin" ? "danger" : user?.role === "Auditor" ? "info" : "success"}>
                {user?.role}
              </Badge>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Account Status</div>
              <Badge variant={user?.status === "DISABLED" ? "danger" : "success"}>
                {user?.status || "ACTIVE"}
              </Badge>
            </div>

            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
              <Button variant="danger" size="sm" icon={LogOut} onClick={logout}>
                Sign Out of Portal
              </Button>
            </div>
          </div>
        </Card>

        {/* Change Password Form */}
        <Card title="Change Account Password" icon={KeyRound}>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Button type="submit" variant="primary" loading={loading} icon={Shield}>
              Update Password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
