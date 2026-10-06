import React from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon: Icon,
  onClick,
  type = "button",
  className = "",
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <span className="spinner" style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
      ) : Icon ? (
        <Icon size={size === "sm" ? 14 : 16} />
      ) : null}
      {children}
    </button>
  );
}
