// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("td_token") || null);
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("td_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const savedToken = localStorage.getItem("td_token");
      if (savedToken) {
        try {
          const userData = await api.getMe();
          setUser(userData);
          setToken(savedToken);
          localStorage.setItem("td_user", JSON.stringify(userData));
        } catch (err) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("td_token");
          localStorage.removeItem("td_user");
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    }
    initAuth();
  }, []);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    const { token: newToken, user: newUser } = data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("td_token", newToken);
    localStorage.setItem("td_user", JSON.stringify(newUser));
    return newUser;
  };

  const logout = async () => {
    try {
      if (token) {
        await api.logout();
      }
    } catch (e) {
      // Ignore logout errors
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem("td_token");
      localStorage.removeItem("td_user");
    }
  };

  const hasRole = (allowedRoles) => {
    if (!user) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        hasRole,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
