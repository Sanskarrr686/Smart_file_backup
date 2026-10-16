import React from "react";

export function Card({ title, icon: Icon, children, className = "", action }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          {title && (
            <h3 className="card-title" style={{ margin: 0 }}>
              {Icon && <Icon size={18} color="var(--primary)" />}
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
