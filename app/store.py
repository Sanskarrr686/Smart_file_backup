"""In-memory Team B working state. Team C remains the system of record."""

from typing import Any

chunk_registry: dict[str, dict[str, Any]] = {}
file_bytes: dict[str, bytes] = {}
version_snapshots: dict[str, dict[str, Any]] = {}
dedup_results: dict[str, dict[str, Any]] = {}
idempotency_cache: dict[str, dict[str, Any]] = {}
last_cache_invalidation_ms: float = 0.0
