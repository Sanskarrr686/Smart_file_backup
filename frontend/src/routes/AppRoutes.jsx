// frontend/src/routes/AppRoutes.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AppLayout } from "../layouts/AppLayout";
import { AuthLayout } from "../layouts/AuthLayout";

// Pages
import { Login } from "../pages/Login";
import { Dashboard } from "../pages/Dashboard";
import { Files } from "../pages/Files";
import { FileVersions } from "../pages/FileVersions";
import { Backups } from "../pages/Backups";
import { Restore } from "../pages/Restore";
import { Reports } from "../pages/Reports";
import { Audit } from "../pages/Audit";
import { Users } from "../pages/Users";
import { Settings } from "../pages/Settings";
import { Forbidden } from "../pages/Forbidden";

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Forbidden />;
  }

  return children;
}

export function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Auth Layout for Login */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
        />
      </Route>

      {/* Main App Layout for Protected Routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin", "Auditor"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/files"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin", "Auditor"]}>
              <Files />
            </ProtectedRoute>
          }
        />

        <Route
          path="/files/:fileId/versions"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin", "Auditor"]}>
              <FileVersions />
            </ProtectedRoute>
          }
        />

        <Route
          path="/backups"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin"]}>
              <Backups />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restore"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin"]}>
              <Restore />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin", "Auditor"]}>
              <Reports />
            </ProtectedRoute>
          }
        />

        <Route
          path="/audit"
          element={
            <ProtectedRoute allowedRoles={["IT Admin", "Auditor"]}>
              <Audit />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={["IT Admin"]}>
              <Users />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute allowedRoles={["Employee", "IT Admin", "Auditor"]}>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all 404/Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
