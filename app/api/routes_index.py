from time import perf_counter, perf_counter_ns

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.routes_dedup import index
from app.api.contracts import success_envelope


router = APIRouter(
    prefix="/internal/v1",
    tags=["Internal Index"],
)


class CacheInvalidationRequest(BaseModel):
    keys: list[str] | None = None
    expiry_seconds: float | None = None


@router.get("/hash-index/{key}")
def lookup_hash_index(key: str):
    start = perf_counter_ns()
    lookup = index.lookup(key)
    elapsed_us = (perf_counter_ns() - start) / 1000

    response = {
        **lookup,
        "lookup_time_us": elapsed_us,
        "index_statistics": index.get_stats(),
    }
    return success_envelope(response)


@router.post("/hash-cache/invalidate")
def invalidate_hash_cache(request: CacheInvalidationRequest):
    started = perf_counter()
    if request.keys is None:
        invalidated_count = index.size()
        index.clear()
    else:
        invalidated_count = sum(
            1
            for key in request.keys
            if index.remove(key)
        )

    invalidation_time_ms = (perf_counter() - started) * 1000

    response = {
        "invalidated_count": invalidated_count,
        "invalidation_time_ms": invalidation_time_ms,
        "index_statistics": index.get_stats(),
    }
    return success_envelope(response)