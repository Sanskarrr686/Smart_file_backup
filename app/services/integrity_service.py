from app.verification.verifier import verify_integrity


def verify_integrity_service(
    chunk_hashes: list[str],
    expected_merkle_root: str,
    verification_algorithm: str = "merkle-tree",
    repetitions: int = 1,
    benchmark_size_bytes: int = 0,
    expected_chunk_hashes: list[str] | None = None,
) -> dict:
    """
    Service layer for integrity verification.

    Keeps the API route separate from the verification algorithm.
    """
    return verify_integrity(
        chunk_hashes=chunk_hashes,
        expected_merkle_root=expected_merkle_root,
        verification_algorithm=verification_algorithm,
        repetitions=repetitions,
        benchmark_size_bytes=benchmark_size_bytes,
        expected_chunk_hashes=expected_chunk_hashes,
    )