import time
import hashlib

from app.merkle.tree import build_merkle_root, localize_corrupted_chunks


def verify_integrity(
    chunk_hashes: list[str],
    expected_merkle_root: str,
    verification_algorithm: str = "merkle-tree",
    repetitions: int = 1,
    benchmark_size_bytes: int = 0,
    expected_chunk_hashes: list[str] | None = None,
) -> dict:
    """
    Verify the integrity of ordered chunk hashes.

    Returns the calculated Merkle root, verification status,
    verified chunks, corrupted chunks, latency, and algorithm.
    """

    start_time = time.perf_counter()

    if not chunk_hashes:
        raise ValueError("chunk_hashes cannot be empty")

    if not expected_merkle_root:
        raise ValueError("expected_merkle_root cannot be empty")

    if verification_algorithm == "merkle-tree":
        calculate = lambda: build_merkle_root(chunk_hashes)
        algorithm_name = "SHA-256 Merkle Tree"
        space_complexity = "O(n)"
    elif verification_algorithm == "checksum":
        calculate = lambda: hashlib.sha256(
            "".join(chunk_hashes).encode("utf-8")
        ).hexdigest()
        algorithm_name = "SHA-256 Checksum"
        space_complexity = "O(1)"
    else:
        raise ValueError("verification_algorithm must be merkle-tree or checksum")

    benchmark_start = time.perf_counter()
    current_merkle_root = calculate()
    for _ in range(repetitions - 1):
        calculate()
    benchmark_latency = time.perf_counter() - benchmark_start

    is_verified = current_merkle_root == expected_merkle_root
    verified_chunks, corrupted_chunks = localize_corrupted_chunks(
        chunk_hashes,
        expected_chunk_hashes,
        is_verified,
    )

    verification_latency = time.perf_counter() - start_time

    return {
        "merkle_root": current_merkle_root,
        "verified": is_verified,
        "verified_chunks": verified_chunks,
        "corrupted_chunks": corrupted_chunks,
        "verification_latency": verification_latency,
        "algorithm": algorithm_name,
        "time_complexity": "O(n)",
        "space_complexity": space_complexity,
        "benchmark": {
            "size_bytes": benchmark_size_bytes,
            "repetitions": repetitions,
            "total_latency": benchmark_latency,
        },
    }