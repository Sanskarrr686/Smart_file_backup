from app.hashing.hasher import Hasher
import pytest


def test_same_data_produces_same_hash():
    hasher = Hasher("sha256")

    hash1 = hasher.hash("Hello World")
    hash2 = hasher.hash("Hello World")

    assert hash1 == hash2


def test_different_data_produces_different_hash():
    hasher = Hasher("sha256")

    hash1 = hasher.hash("Hello World")
    hash2 = hasher.hash("Hello World 2")

    assert hash1 != hash2


def test_sha256_hash_length():
    hasher = Hasher("sha256")

    result = hasher.hash("Hello World")

    assert len(result) == 64


def test_bytes_are_supported():
    hasher = Hasher("sha256")

    result1 = hasher.hash("Hello World")
    result2 = hasher.hash(b"Hello World")

    assert result1 == result2


def test_hash_metadata():
    hasher = Hasher("sha256")

    result = hasher.hash_with_metadata("Hello World")

    assert "hash" in result
    assert "hash_algorithm" in result
    assert "algorithm_version" in result
    assert result["hash_algorithm"] == "SHA256"
    assert result["algorithm_version"] == "v1"


def test_unsupported_algorithm():
    with pytest.raises(ValueError):
        Hasher("invalid_algorithm")