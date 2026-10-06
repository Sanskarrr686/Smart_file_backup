// frontend/src/layouts/Navbar.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { useLiveStream } from "../hooks/useLiveStream";
import { LogOut, User, Bell, Search, FileText, Database, RotateCcw, X, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { Badge } from "../components/common/Badge";

const getRoleVariant = (role) => {
  if (role === "IT Admin") return "danger";
  if (role === "Auditor") return "info";
  return "success";
};

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef(null);

  const performSearch = async (queryStr) => {
    if (!queryStr.trim()) {
      setSearchResults(null);
      setShowSearchDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const res = await api.globalSearch(queryStr);
      setSearchResults(res);
      setShowSearchDropdown(true);
    } catch (e) {
      setSearchResults({ files: [], backups: [], restores: [] });
      setShowSearchDropdown(true);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch(searchQuery);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleNavigate = (path) => {
    setShowSearchDropdown(false);
    navigate(path);
  };

  // Click outside listener to close dropdowns
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    try {
      await api.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  return (
    <header
      style={{
        height: 64,
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 800,
      }}
    >
      {/* Global Search Bar */}
      <div ref={searchRef} style={{ position: "relative", width: 340 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => searchQuery.trim() && setShowSearchDropdown(true)}
            placeholder="Search files, backups, restores by name or ID..."
            className="form-control"
            style={{ height: 36, fontSize: 13, border: "1px solid var(--border-color)", background: "#f8fafc", width: "100%" }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
              style={{ border: "none", background: "none", cursor: "pointer", padding: 2 }}
            >
              <X size={14} color="var(--text-muted)" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchDropdown && searchResults && (
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 0,
              right: 0,
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              maxHeight: 400,
              overflowY: "auto",
              zIndex: 1000,
              padding: "12px 16px",
            }}
          >
            {searching ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
                Searching...
              </div>
            ) : (!searchResults.files?.length && !searchResults.backups?.length && !searchResults.restores?.length) ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>
                No results found for "{searchQuery}"
              </div>
            ) : (
              <>
                {/* Files */}
                {searchResults.files?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <FileText size={12} /> Files ({searchResults.files.length})
                    </div>
                    {searchResults.files.map((f) => (
                      <div
                        key={f.file_id}
                        onClick={() => handleNavigate(`/files`)}
                        style={{ fontSize: 13, padding: "6px 8px", borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                        className="hover-bg-slate"
                      >
                        <div>
                          <strong>{f.name}</strong> <span style={{ fontSize: 11, color: "#64748b" }}>({f.file_id})</span>
                        </div>
                        <Badge variant="info">{f.size_kb} KB</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Backups */}
                {searchResults.backups?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <Database size={12} /> Backups ({searchResults.backups.length})
                    </div>
                    {searchResults.backups.map((b) => (
                      <div
                        key={b.backup_id}
                        onClick={() => handleNavigate(`/backups`)}
                        style={{ fontSize: 13, padding: "6px 8px", borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                        className="hover-bg-slate"
                      >
                        <div>
                          <strong>{b.file_name}</strong> <span style={{ fontSize: 11, color: "#64748b" }}>({b.backup_id})</span>
                        </div>
                        <Badge variant={b.state === "COMPLETED" || b.state === "COMMITTED" ? "success" : b.state === "FAILED" ? "danger" : "warning"}>{b.state}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Restores */}
                {searchResults.restores?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <RotateCcw size={12} /> Restores ({searchResults.restores.length})
                    </div>
                    {searchResults.restores.map((r) => (
                      <div
                        key={r.restore_id}
                        onClick={() => handleNavigate(`/restore`)}
                        style={{ fontSize: 13, padding: "6px 8px", borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                        className="hover-bg-slate"
                      >
                        <div>
                          <strong>{r.restore_id}</strong> <span style={{ fontSize: 11, color: "#64748b" }}>(File: {r.file_id}, Ver: {r.version_id})</span>
                        </div>
                        <Badge variant={r.state === "COMPLETED" ? "success" : r.state === "FAILED" ? "danger" : "warning"}>{r.state}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* User Actions & Notifications */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* Bell Icon & Notifications Dropdown */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              position: "relative",
              padding: 4,
            }}
            title="Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: "50%",
                  minWidth: 16,
                  height: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifDropdown && (
            <div
              style={{
                position: "absolute",
                top: 40,
                right: 0,
                width: 320,
                backgroundColor: "#ffffff",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12)",
                maxHeight: 380,
                overflowY: "auto",
                zIndex: 1000,
              }}
            >
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    style={{ border: "none", background: "none", color: "var(--primary)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
                  No recent notifications
                </div>
              ) : (
                notifications.slice(0, 15).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid #f1f5f9",
                      backgroundColor: n.read ? "#ffffff" : "#f0f9ff",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    {n.type === "success" ? (
                      <CheckCircle size={16} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : n.type === "error" ? (
                      <AlertTriangle size={16} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : (
                      <Info size={16} color="#0284c7" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ height: 24, width: 1, backgroundColor: "var(--border-color)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: "var(--primary-light)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            <User size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {user?.name || user?.username}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Badge variant={getRoleVariant(user?.role)}>{user?.role}</Badge>
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="btn btn-secondary btn-sm"
          style={{ color: "var(--danger)", borderColor: "#fecaca" }}
          title="Logout"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}

