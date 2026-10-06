// frontend/src/pages/Users.jsx
import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { SkeletonTable } from "../components/common/Skeleton";
import { StateMessage } from "../components/common/StateMessage";
import { useToast } from "../components/common/Toast";
import { Users as UsersIcon, UserPlus, KeyRound, UserCheck, UserX, RefreshCw } from "lucide-react";

export function Users() {
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add User Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("Employee");
  const [password, setPassword] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Reset Password Modal State
  const [resetTarget, setResetTarget] = useState(null);
  const [newResetPassword, setNewResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const { addToast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUsers();
      setUsersList(res?.items || []);
    } catch (err) {
      setError(err.message || "Failed to load users list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) {
      addToast("Name, username, and temporary password are required.", "error");
      return;
    }

    setAddLoading(true);
    try {
      const newUser = await api.createUser(name, username, role, password);
      addToast(`User '${newUser.username}' created successfully!`, "success");
      setIsAddOpen(false);
      setName("");
      setUsername("");
      setRole("Employee");
      setPassword("");
      fetchUsers();
    } catch (err) {
      if (err.code === "DUPLICATE_USERNAME") {
        addToast(`Username '${username}' is already taken.`, "error");
      } else {
        addToast(err.message || "Failed to create user.", "error");
      }
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleStatus = async (userObj) => {
    const targetStatus = userObj.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    try {
      await api.updateUserStatus(userObj.user_id, targetStatus);
      addToast(`User status updated to ${targetStatus}`, "info");
      fetchUsers();
    } catch (err) {
      addToast(err.message || "Failed to update user status.", "error");
    }
  };

  const handleResetPassword = async () => {
    if (!newResetPassword.trim()) {
      addToast("Please enter a new password.", "error");
      return;
    }

    setResetLoading(true);
    try {
      await api.resetPassword(resetTarget.user_id, newResetPassword);
      addToast(`Password reset for user '${resetTarget.username}'!`, "success");
      setResetTarget(null);
      setNewResetPassword("");
    } catch (err) {
      addToast(err.message || "Failed to reset password.", "error");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage administrative user accounts, roles, access status, and passwords."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchUsers}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon={UserPlus} onClick={() => setIsAddOpen(true)}>
              Add User
            </Button>
          </div>
        }
      />

      <Card>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <StateMessage type="error" message={error} onRetry={fetchUsers} />
        ) : usersList.length === 0 ? (
          <StateMessage title="No Users Found" message="No user accounts configured." />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => (
                  <tr key={u.user_id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{u.user_id}</td>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td>{u.username}</td>
                    <td>
                      <Badge
                        variant={
                          u.role === "IT Admin" ? "danger" : u.role === "Auditor" ? "info" : "success"
                        }
                      >
                        {u.role}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={u.status === "DISABLED" ? "danger" : "success"}>
                        {u.status || "ACTIVE"}
                      </Badge>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "N/A"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={u.status === "DISABLED" ? UserCheck : UserX}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {u.status === "DISABLED" ? "Enable" : "Disable"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={KeyRound}
                          onClick={() => setResetTarget(u)}
                        >
                          Reset Pass
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Create New User Account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={addLoading} onClick={handleCreateUser}>
              Create User
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Username / Email</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. employee2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">System Role</label>
            <select
              className="form-control"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="Employee">Employee</option>
              <option value="IT Admin">IT Admin</option>
              <option value="Auditor">Auditor</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Temporary Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Reset Password — ${resetTarget?.username}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={resetLoading} onClick={handleResetPassword}>
              Reset Password
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">New Password for {resetTarget?.username}</label>
          <input
            type="password"
            className="form-control"
            placeholder="Enter new password"
            value={newResetPassword}
            onChange={(e) => setNewResetPassword(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
