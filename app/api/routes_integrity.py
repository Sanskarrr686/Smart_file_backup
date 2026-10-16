from fastapi import APIRouter, Header, HTTPException

from app.models.integrity import (
    IntegrityVerifyRequest,
    IntegrityVerifyResponse,
)
from app.services.integrity_service import verify_integrity_service
from app.api.contracts import success_envelope
from app.services.minio_processing import verify_minio_backup
from app.services.minio_store import MinioConfigurationError, MinioStore


router = APIRouter(
    prefix="/api/v1/integrity",
    tags=["Integrity"],
)


@router.post(
    "/verify",
    response_model=IntegrityVerifyResponse,
)
def verify_integrity_endpoint(
    request: IntegrityVerifyRequest,
    x_correlation_id: str | None = Header(default=None),
):
    try:
        if request.backup_id:
            store = MinioStore.from_env()
            response = verify_minio_backup(store, request.backup_id)
            store.save_integrity_result(request.backup_id, response)
            response.update(
                {
                    "verification_latency": 0.0,
                    "algorithm": "SHA-256 Merkle Tree",
                    "time_complexity": "O(n)",
                    "space_complexity": "O(n)",
                    "benchmark": {
                        "size_bytes": 0,
                        "repetitions": 1,
                        "total_latency": 0.0,
                    },
                }
            )
            return success_envelope(response, x_correlation_id)

        if not request.chunk_hashes or not request.expected_merkle_root:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Provide backup_id or both chunk_hashes and "
                    "expected_merkle_root"
                ),
            )

        response = verify_integrity_service(
            chunk_hashes=request.chunk_hashes or [],
            expected_merkle_root=request.expected_merkle_root or "",
            verification_algorithm=request.verification_algorithm,
            expected_chunk_hashes=request.expected_chunk_hashes,
            repetitions=request.repetitions,
            benchmark_size_bytes=request.benchmark_size_bytes,
        )
        return success_envelope(response, x_correlation_id)
    except MinioConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.get("/{backup_id}")
def get_integrity_result(
    backup_id: str,
    x_correlation_id: str | None = Header(default=None),
):
    try:
        store = MinioStore.from_env()
        result = store.get_integrity_result(backup_id)
    except MinioConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No integrity result found for backup_id '{backup_id}'",
        )
    return success_envelope(result, x_correlation_id)