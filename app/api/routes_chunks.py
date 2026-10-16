from pathlib import Path

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from app.hashing.hasher import Hasher
from app.api.routes_dedup import index
from app.api.contracts import success_envelope

from app.chunking.fixed import fixed_size_chunks
from app.chunking.content_defined import content_defined_chunks
from app.services.minio_store import MinioConfigurationError, MinioStore


router = APIRouter(
    prefix="/api/v1/chunks",
    tags=["Chunking"],
)
internal_router = APIRouter(
    prefix="/internal/v1",
    tags=["Internal Chunks"],
)


chunk_registry: dict[str, dict] = {}


class ChunkRequest(BaseModel):
    chunk_request_id: str | None = None
    file_path: str | None = None
    file_id: str | None = None
    version_ref: str | None = None
    method: str = "fixed"
    chunk_size: int = 4096
    chunk_boundaries: str | None = None
    hash_algorithm: str = "sha256"


class ChunkRegistrationRequest(BaseModel):
    file_id: str
    version_id: str
    chunk_index: int
    hash_value: str
    size_bytes: int
    metadata: dict = {}
    expiry_seconds: float | None = Field(default=None, gt=0)


@router.post("/")
def create_chunks(
    request: ChunkRequest,
    x_correlation_id: str | None = Header(default=None),
):
    try:
        if not request.file_path:
            raise ValueError("file_path is required by the local file adapter")

        file_path = Path(request.file_path)
        hasher = Hasher(request.hash_algorithm)

        if not file_path.exists():
            raise FileNotFoundError(
                f"File not found: {request.file_path}"
            )

        selected_method = (
            request.chunk_boundaries or request.method or "fixed"
        ).replace("-", "_").lower()

        if selected_method == "fixed":
            chunks = fixed_size_chunks(
                file_path,
                request.chunk_size,
            )

            response_chunks = [
                {
                    "chunk_id": chunk["chunk_id"],
                    "chunk_number": chunk["chunk_number"],
                    "offset": chunk["offset"],
                    "size": chunk["size"],
                    "hash": hasher.hash(chunk["data"]),
                }
                for chunk in chunks
            ]

        elif selected_method in {"content_defined", "content_defined_chunking"}:
            chunks = content_defined_chunks(
                file_path,
                hash_algorithm=request.hash_algorithm,
            )
            response_chunks = chunks

        else:
            raise ValueError(
                "method/chunk_boundaries must be 'fixed' or 'content-defined'"
            )

        response = {
            "chunk_request_id": request.chunk_request_id,
            "file_id": request.file_id,
            "version_ref": request.version_ref,
            "file_path": str(file_path),
            "method": selected_method,
            "chunk_boundaries": selected_method,
            "chunk_version": "v1",
            "total_chunks": len(response_chunks),
            "chunks": response_chunks,
            "coverage_summary": {
                "file_size_bytes": file_path.stat().st_size,
                "average_chunk_size": (
                    file_path.stat().st_size / len(response_chunks)
                    if response_chunks else 0
                ),
                "covered_percent": 100.0,
            },
            "validation_errors": [],
            "hash_algorithm": request.hash_algorithm,
        }
        return success_envelope(response, x_correlation_id)

    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@internal_router.put("/chunks/{chunk_id}")
def register_chunk(
    chunk_id: str,
    request: ChunkRegistrationRequest,
    x_correlation_id: str | None = Header(default=None),
):
    registered_at = datetime.now(timezone.utc).isoformat()
    chunk_registry[chunk_id] = {
        "chunk_id": chunk_id,
        "file_id": request.file_id,
        "version_id": request.version_id,
        "chunk_index": request.chunk_index,
        "hash_value": request.hash_value,
        "size_bytes": request.size_bytes,
        "metadata": request.metadata,
        "registered_at": registered_at,
    }
    index.insert(
        request.hash_value,
        chunk_id,
        expiry_seconds=request.expiry_seconds,
    )

    response = {
        "chunk_id": chunk_id,
        "registered_at": registered_at,
        "chunk_version": "v1",
        "correlation_id": x_correlation_id,
    }
    return success_envelope(response, x_correlation_id)


@router.get("/index")
def get_chunks_index():
    try:
        store = MinioStore.optional_from_env()
    except MinioConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if store is not None:
        statistics = store.get_chunk_statistics()
        response = {
            "total_chunks": statistics["unique_chunks"],
            "unique_chunks": statistics["unique_chunks"],
            "duplicate_chunks": 0,
            "coverage_percent": 100.0 if statistics["unique_chunks"] else 0.0,
            "total_size_bytes": statistics["total_size_bytes"],
            "chunk_version": "v1",
            "chunks": [],
            "storage_backend": getattr(store, "provider", "backblaze-b2"),
            "healthy": True,
        }
        return success_envelope(response)

    total_chunks = len(chunk_registry)
    total_bytes = sum(
        chunk["size_bytes"]
        for chunk in chunk_registry.values()
    )

    response = {
        "total_chunks": total_chunks,
        "unique_chunks": total_chunks,
        "duplicate_chunks": 0,
        "coverage_percent": 100.0 if total_chunks else 0.0,
        "total_size_bytes": total_bytes,
        "chunk_version": "v1",
        "chunks": list(chunk_registry.values()),
        "storage_backend": "memory",
        "healthy": True,
    }
    return success_envelope(response)