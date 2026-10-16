"""
Hashing utilities for Team B.

Provides a simple, pluggable hashing interface.
"""

import hashlib
from typing import Union


class Hasher:
    """Generate deterministic hashes for file chunks."""

    SUPPORTED_ALGORITHMS = {
        "sha256": hashlib.sha256,
        "sha1": hashlib.sha1,
    }

    ALGORITHM_VERSION = "v1"

    def __init__(self, algorithm: str = "sha256"):
        algorithm = algorithm.lower()

        if algorithm not in self.SUPPORTED_ALGORITHMS:
            raise ValueError(
                f"Unsupported hashing algorithm: {algorithm}. "
                f"Supported algorithms: {list(self.SUPPORTED_ALGORITHMS.keys())}"
            )

        self.algorithm = algorithm

    def hash(self, data: Union[str, bytes, bytearray]) -> str:
        """
        Generate a hexadecimal hash for the given data.

        Args:
            data: Chunk data as str, bytes, or bytearray.

        Returns:
            Hexadecimal hash string.
        """

        if isinstance(data, str):
            data = data.encode("utf-8")

        elif isinstance(data, bytearray):
            data = bytes(data)

        elif not isinstance(data, bytes):
            raise TypeError("data must be str, bytes, or bytearray")

        hash_function = self.SUPPORTED_ALGORITHMS[self.algorithm]
        return hash_function(data).hexdigest()

    def hash_with_metadata(
        self, data: Union[str, bytes, bytearray]
    ) -> dict:
        """
        Generate a hash together with algorithm metadata.
        """

        return {
            "hash": self.hash(data),
            "hash_algorithm": self.algorithm.upper(),
            "algorithm_version": self.ALGORITHM_VERSION,
        }