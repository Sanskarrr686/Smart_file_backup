"""Pluggable hash index with a stable lookup contract for Team B APIs."""

from time import perf_counter, perf_counter_ns
from typing import Optional

from app.index.avl_tree import AVLTree
from app.index.hashmap_index import HashMapIndex
from app.index.rb_tree import RBTree


class HashCollisionError(Exception):
    """Raised when the same hash maps to two different payload sizes."""


class UnifiedHashIndex:
    """
    Adapter over HashMap, AVL, and Red-Black backends.

    Lookup always returns the Team B contract fields:
    existing_chunk_ref, lookup_time_us, cache_hit, index_version.
    """

    SUPPORTED_BACKENDS = ("hashmap", "avl", "rb")
    ALGORITHM_VERSION = "v1"

    def __init__(self, backend: str = "hashmap") -> None:
        self._sizes: dict[str, int] = {}
        self._expiry: dict[str, float] = {}
        self._cache_hits = 0
        self._cache_misses = 0
        self._hash_algorithm: str | None = None
        self._init_backend(backend)

    def _init_backend(self, backend: str) -> None:
        backend = backend.lower()
        if backend not in self.SUPPORTED_BACKENDS:
            raise ValueError(
                f"unsupported index backend: {backend}. "
                f"Supported: {list(self.SUPPORTED_BACKENDS)}"
            )
        self._backend_name = backend
        if backend == "hashmap":
            self._backend = HashMapIndex()
        elif backend == "avl":
            self._backend = AVLTree()
        else:
            self._backend = RBTree()

    @property
    def index_version(self) -> str:
        return f"{self.ALGORITHM_VERSION}-{self._backend_name}"

    @property
    def backend_name(self) -> str:
        return self._backend_name

    @property
    def hash_algorithm(self) -> str | None:
        return self._hash_algorithm

    def switch_backend(self, backend: str) -> None:
        entries = list(self.items())
        sizes = dict(self._sizes)
        expiry = dict(self._expiry)
        algorithm = self._hash_algorithm
        hits = self._cache_hits
        misses = self._cache_misses
        self._init_backend(backend)
        self._sizes = {}
        self._expiry = {}
        self._hash_algorithm = algorithm
        self._cache_hits = hits
        self._cache_misses = misses
        for key, value in entries:
            self._backend.insert(key, value)
            if key in sizes:
                self._sizes[key] = sizes[key]
            if key in expiry:
                self._expiry[key] = expiry[key]

    def set_hash_algorithm(self, algorithm: str) -> None:
        algorithm = algorithm.lower()
        if self._hash_algorithm and self._hash_algorithm != algorithm:
            raise ValueError(
                f"hash-algorithm version mismatch: index uses "
                f"{self._hash_algorithm}, request used {algorithm}"
            )
        self._hash_algorithm = algorithm

    def insert(
        self,
        chunk_hash: str,
        chunk_ref: str,
        expiry_seconds: float | None = None,
        size: int | None = None,
    ) -> None:
        if not isinstance(chunk_hash, str) or not chunk_hash:
            raise ValueError("chunk_hash must be a non-empty string")
        if not isinstance(chunk_ref, str) or not chunk_ref:
            raise ValueError("chunk_ref must be a non-empty string")

        existing = self._backend_lookup(chunk_hash)
        if existing is not None and size is not None:
            stored_size = self._sizes.get(chunk_hash)
            if stored_size is not None and stored_size != size:
                raise HashCollisionError(
                    f"hash collision for {chunk_hash}: "
                    f"stored_size={stored_size}, new_size={size}"
                )

        self._backend.insert(chunk_hash, chunk_ref)
        if size is not None:
            self._sizes[chunk_hash] = size
        if expiry_seconds is None:
            self._expiry.pop(chunk_hash, None)
        else:
            if expiry_seconds <= 0:
                raise ValueError("expiry_seconds must be greater than 0")
            self._expiry[chunk_hash] = perf_counter() + expiry_seconds

    def lookup(self, chunk_hash: str, index_version: str | None = None) -> dict:
        if index_version is not None and index_version != self.index_version:
            raise ValueError(
                f"INDEX_VERSION_MISMATCH: expected {self.index_version}, "
                f"received {index_version}"
            )

        if self._is_expired(chunk_hash):
            self.remove(chunk_hash)

        start = perf_counter_ns()
        chunk_ref = self._backend_lookup(chunk_hash)
        elapsed_ns = perf_counter_ns() - start

        if chunk_ref is None:
            self._cache_misses += 1
        else:
            self._cache_hits += 1

        return {
            "existing_chunk_ref": chunk_ref,
            "lookup_time_us": elapsed_ns / 1000,
            "cache_hit": chunk_ref is not None,
            "index_version": self.index_version,
        }

    def search(self, chunk_hash: str) -> Optional[str]:
        if self._is_expired(chunk_hash):
            self.remove(chunk_hash)
            return None
        return self._backend_lookup(chunk_hash)

    def get_size(self, chunk_hash: str) -> int | None:
        return self._sizes.get(chunk_hash)

    def contains(self, chunk_hash: str) -> bool:
        return self.search(chunk_hash) is not None

    def remove(self, chunk_hash: str) -> bool:
        removed = False
        if hasattr(self._backend, "remove"):
            removed = bool(self._backend.remove(chunk_hash))
        self._sizes.pop(chunk_hash, None)
        self._expiry.pop(chunk_hash, None)
        return removed

    def size(self) -> int:
        return self._backend.size()

    def items(self):
        if hasattr(self._backend, "items"):
            return self._backend.items()
        return []

    def clear(self) -> None:
        self._backend.clear()
        self._sizes.clear()
        self._expiry.clear()
        self._hash_algorithm = None

    def get_stats(self) -> dict:
        return {
            "index_version": self.index_version,
            "index_backend": self._backend_name,
            "entry_count": self.size(),
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "cache_hit_rate": self.cache_hit_rate,
            "hash_algorithm": self._hash_algorithm,
        }

    @property
    def cache_hit_rate(self) -> float:
        total = self._cache_hits + self._cache_misses
        return self._cache_hits / total if total else 0.0

    def _backend_lookup(self, chunk_hash: str) -> Optional[str]:
        result = self._backend.lookup(chunk_hash)
        if isinstance(result, dict):
            return result.get("existing_chunk_ref")
        return result

    def _is_expired(self, chunk_hash: str) -> bool:
        expiry = self._expiry.get(chunk_hash)
        return expiry is not None and perf_counter() >= expiry
