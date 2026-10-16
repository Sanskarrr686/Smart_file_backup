import pytest

from app.index.hashmap_index import HashMapIndex


def test_insert_and_lookup():
    index = HashMapIndex()

    index.insert("hash_001", "chunk_001")

    result = index.lookup("hash_001")

    assert result["existing_chunk_ref"] == "chunk_001"
    assert result["cache_hit"] is True
    assert result["index_version"] == "v1"


def test_lookup_missing_hash():
    index = HashMapIndex()

    result = index.lookup("missing_hash")

    assert result["existing_chunk_ref"] is None
    assert result["cache_hit"] is False


def test_contains():
    index = HashMapIndex()

    index.insert("hash_001", "chunk_001")

    assert index.contains("hash_001") is True
    assert index.contains("hash_999") is False


def test_remove():
    index = HashMapIndex()

    index.insert("hash_001", "chunk_001")

    assert index.remove("hash_001") is True
    assert index.contains("hash_001") is False


def test_remove_missing_hash():
    index = HashMapIndex()

    assert index.remove("missing_hash") is False


def test_size():
    index = HashMapIndex()

    index.insert("hash_001", "chunk_001")
    index.insert("hash_002", "chunk_002")

    assert index.size() == 2


def test_clear():
    index = HashMapIndex()

    index.insert("hash_001", "chunk_001")
    index.insert("hash_002", "chunk_002")

    index.clear()

    assert index.size() == 0


def test_index_version_mismatch():
    index = HashMapIndex()

    index.insert("hash_001", "chunk_001")

    with pytest.raises(ValueError, match="INDEX_VERSION_MISMATCH"):
        index.lookup("hash_001", index_version="v2")


def test_empty_hash_is_rejected():
    index = HashMapIndex()

    with pytest.raises(ValueError):
        index.insert("", "chunk_001")


def test_empty_chunk_reference_is_rejected():
    index = HashMapIndex()

    with pytest.raises(ValueError):
        index.insert("hash_001", "")