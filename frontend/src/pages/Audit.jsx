// frontend/src/pages/Audit.jsx
import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { useLiveStream } from "../hooks/useLiveStream";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { SkeletonTable } from "../components/common/Skeleton";
import { StateMessage } from "../components/common/StateMessage";
import { ShieldAlert, Search, RefreshCw, Hash } from "lucide-react";

export function Audit() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAuditLogs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await api.getAudit();
      setLogs(res?.items || []);
    } catch (err) {
      if (showLoading) setError(err.message || "Failed to load audit trail logs.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleLiveEvent = useCallback((event) => {
    if (event.type === "audit_created" && event.data) {
      setLogs((prev) => [event.data, ...prev]);
    }
  }, []);

  useLiveStream(handleLiveEvent);

  useEffect(() => {
    fetchAuditLogs(true);
  }, []);

  const actionsList = Array.from(new Set(logs.map((l) => l.action).filter(Boolean)));

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.user || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.resource || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.correlation_id || "").toLowerCase().includes(search.toLowerCase());
    const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  return (
    <div>
      <PageHeader
        title="Audit Trail Log"
        subtitle="Read-only immutable security activity events, resource modifications, and correlation IDs."
        action={
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAuditLogs}>
            Refresh Audit Logs
          </Button>
        }
      />

      <Card>
        {/* Filter Controls */}
        <div className="filter-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by user, resource, or correlation ID..."
              className="form-control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 200 }}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="ALL">All Event Actions</option>
            {actionsList.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <StateMessage type="error" message={error} onRetry={fetchAuditLogs} />
        ) : filteredLogs.length === 0 ? (
          <StateMessage title="No Audit Records" message="No audit logs matched your search filters." />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User / Actor</th>
                  <th>Role</th>
                  <th>Action Event</th>
                  <th>Target Resource</th>
                  <th>Result</th>
                  <th>Correlation ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.user}</td>
                    <td>
                      <Badge variant={item.role === "IT Admin" ? "danger" : "info"}>
                        {item.role}
                      </Badge>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{item.action}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{item.resource}</td>
                    <td>
                      <Badge variant={item.result === "SUCCESS" ? "success" : "danger"}>
                        {item.result || "SUCCESS"}
                      </Badge>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Hash size={12} />
                        {item.correlation_id}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
