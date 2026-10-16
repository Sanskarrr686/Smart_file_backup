from typing import Any
from uuid import uuid4

from app.dedup.delta import (
    calculate_delta_size,
    calculate_savings_ratio,
)
from app.index.unified import HashCollisionError
from app.merkle.tree import merkle_root_or_empty
from app.models.dedup import DedupResult


class IndexVersionMismatchError(Exception):
    """Raised when the requested index version does not match the live index."""


class DeduplicationEngine:
    """
    Core deduplication engine.

    Responsibilities:
    1. Receive ordered chunks.
    2. Look up each chunk hash in the hash index.
    3. Identify duplicate and unique chunks.
    4. Calculate delta size.
    5. Calculate storage savings.
    6. Produce DedupResult.
    """

    def __init__(self, index):
        self.index = index

    def compute(
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

        actual_index_version = self.index.index_version

        if (
            expected_index_version is not None
            and expected_index_version != actual_index_version
        ):
            raise IndexVersionMismatchError(
                f"Index version mismatch: "
                f"expected={expected_index_version}, "
                f"actual={actual_index_version}"
            )

        unique_chunks = 0
        duplicate_chunks = 0
        unique_chunk_sizes = []
        version_delta_sizes = []
        previous_set = set(previous_version_hashes or [])
        ordered_hashes = []

        for chunk in chunks:
            chunk_hash = self._get_chunk_hash(chunk)
            chunk_size = self._get_chunk_size(chunk)
            ordered_hashes.append(chunk_hash)

            if previous_version_hashes is not None and chunk_hash not in previous_set:
                version_delta_sizes.append(chunk_size)

            existing_chunk = self._lookup_chunk(chunk_hash)
            stored_size = None
            if hasattr(self.index, "get_size"):
                stored_size = self.index.get_size(chunk_hash)

            if existing_chunk is not None:
                if stored_size is not None and stored_size != chunk_size:
                    raise HashCollisionError(
                        f"hash collision for {chunk_hash}: "
                        f"stored_size={stored_size}, new_size={chunk_size}"
                    )
                duplicate_chunks += 1
            else:
                unique_chunks += 1
                unique_chunk_sizes.append(chunk_size)
                try:
                    self.index.insert(
                        chunk_hash,
                        self._get_chunk_reference(chunk),
                        size=chunk_size,
                    )
                except TypeError:
                    self.index.insert(
                        chunk_hash,
                        self._get_chunk_reference(chunk),
                    )

        total_chunks = len(chunks)
        original_size = sum(self._get_chunk_size(chunk) for chunk in chunks)

        if previous_version_hashes is not None:
            delta_size = calculate_delta_size(version_delta_sizes)
        else:
            delta_size = calculate_delta_size(unique_chunk_sizes)

        savings_ratio = calculate_savings_ratio(original_size, delta_size)
        merkle_root = merkle_root_or_empty(ordered_hashes)

        return DedupResult(
            dedup_result_id=str(uuid4()),
            file_id=file_id,
            version=version,
            total_chunks=total_chunks,
            unique_chunks=unique_chunks,
            duplicate_chunks=duplicate_chunks,
            original_size=original_size,
            delta_size=delta_size,
            savings_ratio=savings_ratio,
            algorithm=algorithm,
            index_version=actual_index_version,
            merkle_root=merkle_root,
            previous_version_reference=previous_version_reference,
            optimization_metric=optimization_metric,
            index_backend=index_backend or getattr(
                self.index, "backend_name", None
            ),
        )

    # =================================================
    # Helper methods
    # =================================================

    @staticmethod
    def _get_chunk_hash(chunk: Any) -> str:

        if hasattr(chunk, "hash"):
            chunk_hash = chunk.hash

        elif isinstance(chunk, dict):
            chunk_hash = chunk.get("hash")

        else:
            raise TypeError(
                "Chunk must provide a hash field"
            )

        if not chunk_hash:
            raise ValueError(
                "Chunk hash cannot be empty"
            )

        return str(chunk_hash)

    @staticmethod
    def _get_chunk_size(chunk: Any) -> int:

        if hasattr(chunk, "size"):
            size = chunk.size

        elif isinstance(chunk, dict):
            size = chunk.get("size")

        else:
            raise TypeError(
                "Chunk must provide a size field"
            )

        if size is None:
            raise ValueError(
                "Chunk size is required"
            )

        size = int(size)

        if size < 0:
            raise ValueError(
                "Chunk size cannot be negative"
            )

        return size

    @staticmethod
    def _get_chunk_reference(chunk: Any) -> str:
        if hasattr(chunk, "chunk_id"):
            chunk_id = chunk.chunk_id
        elif isinstance(chunk, dict):
            chunk_id = chunk.get("chunk_id")
        else:
            raise TypeError("Chunk must provide a chunk_id field")

        if not chunk_id:
            raise ValueError("Chunk id cannot be empty")

        return str(chunk_id)

    def _lookup_chunk(self, chunk_hash: str):
        if hasattr(self.index, "lookup"):
            result = self.index.lookup(chunk_hash)
            if isinstance(result, dict):
                return result["existing_chunk_ref"]
            return result
        return self.index.search(chunk_hash)