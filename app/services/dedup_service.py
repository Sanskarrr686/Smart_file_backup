from typing import Any

from app.dedup.engine import DeduplicationEngine
from app.models.dedup import DedupResult


class DeduplicationService:
    """
    Service layer for deduplication.

    Keeps API/routes separate from the core
    deduplication algorithm.
    """

    def __init__(self, index):
        self.engine = DeduplicationEngine(index)

    def compute_deduplication(
        self,
        file_id: str,
        version: int,
        chunks: list[Any],
        algorithm: str = "sha256",
        expected_index_version: str | None = None,
        previous_version_hashes: list[str] | None = None,
        previous_version_reference: str | None = None,
        optimization_metric: str = "minimize_delta",
        index_backend: str | None = None,
    ) -> DedupResult:

        return self.engine.compute(
            file_id=file_id,
            version=version,
            chunks=chunks,
            algorithm=algorithm,
            expected_index_version=expected_index_version,
            previous_version_hashes=previous_version_hashes,
            previous_version_reference=previous_version_reference,
            optimization_metric=optimization_metric,
            index_backend=index_backend,
        )