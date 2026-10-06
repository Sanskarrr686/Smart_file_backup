// frontend/src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/common/Button";
import { LogIn, AlertCircle } from "lucide-react";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please fill in both username and password.");
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      if (err.code === "ACCOUNT_DISABLED") {
        setError("Your user account has been disabled by an IT Administrator.");
      } else if (err.code === "INVALID_CREDENTIALS") {
        setError("Invalid username or password.");
      } else {
        setError(err.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="card" style={{ padding: 32, background: "white", boxShadow: "var(--shadow-lg)" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
        Sign In to Portal
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, textAlign: "center" }}>
        Enter your enterprise credentials to access your dashboard.
      </p>

      {error && (
        <div
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger)",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            marginBottom: 20,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Username or Email</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g. employee1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-control"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <Button type="submit" variant="primary" loading={loading} icon={LogIn} style={{ width: "100%" }}>
          Sign In
        </Button>
      </form>
    </div>
  );
}
