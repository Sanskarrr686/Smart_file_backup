from typing import Any

from app.store import idempotency_cache


def success_envelope(data: dict[str, Any], correlation_id: str | None = None) -> dict[str, Any]:
    return {
        **data,
        "data": data,
        "meta": {
            "correlation_id": correlation_id,
            "api_version": "v1",
        },
    }


def idempotency_get(scope: str, key: str | None) -> dict[str, Any] | None:
    if not key:
        return None
    return idempotency_cache.get(f"{scope}:{key}")


def idempotency_put(scope: str, key: str | None, payload: dict[str, Any]) -> None:
    if not key:
        return
    if len(idempotency_cache) > 2048:
        idempotency_cache.clear()
    idempotency_cache[f"{scope}:{key}"] = payload
