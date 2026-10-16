import React from "react";

export function Skeleton({ width = "100%", height = "20px", borderRadius = "6px", style = {} }) {
  return (
    <div
      className="skeleton-box"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <Skeleton width="40%" height="24px" style={{ marginBottom: 12 }} />
      <Skeleton width="100%" height="60px" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="table-container" style={{ padding: 16 }}>
      <Skeleton width="100%" height="32px" style={{ marginBottom: 12 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height="40px" style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}
