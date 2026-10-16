import pytest

from app.merkle.tree import build_merkle_root
from app.verification.verifier import verify_integrity


def test_integrity_verification_success():
    chunk_hashes = ["hash1", "hash2"]
    expected_root = build_merkle_root(chunk_hashes)

    result = verify_integrity(
        chunk_hashes,
        expected_root
    )

    assert result["verified"] is True
    assert result["merkle_root"] == expected_root
    assert result["verified_chunks"] == [0, 1]
    assert result["corrupted_chunks"] == []
    assert result["verification_latency"] >= 0
    assert result["algorithm"] == "SHA-256 Merkle Tree"


def test_integrity_verification_failure():
    chunk_hashes = ["hash1", "hash2"]
    wrong_root = "0" * 64

    result = verify_integrity(
        chunk_hashes,
        wrong_root
    )

    assert result["verified"] is False
    assert result["corrupted_chunks"] == [0, 1]


def test_empty_chunk_hashes():
    with pytest.raises(ValueError):
        verify_integrity([], "0" * 64)


def test_empty_expected_root():
    with pytest.raises(ValueError):
        verify_integrity(["hash1"], "")