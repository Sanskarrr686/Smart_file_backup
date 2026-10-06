import React from "react";

export function Badge({ children, variant = "secondary", icon: Icon }) {
  const variantClass = `badge-${variant}`;
  return (
    <span className={`badge ${variantClass}`}>
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}
