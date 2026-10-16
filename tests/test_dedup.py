import pytest

from app.dedup.engine import (
    DeduplicationEngine,
    IndexVersionMismatchError,
)


class FakeHashIndex:
    """
    Temporary test index.

    This is ONLY for unit testing Member 3's
    deduplication logic.

    The actual application will use
    Member 2's HashMap/AVL/RB implementation.
    """

    def __init__(self, index_version="v1"):
        self.data = {}
        self.index_version = index_version

    def search(self, chunk_hash):
        return self.data.get(chunk_hash)

    def insert(self, chunk_hash, chunk_reference):
        self.data[chunk_hash] = chunk_reference


def test_identical_file():

    index = FakeHashIndex()

    # Original chunks already exist
    index.insert("hashA", {"chunk_id": "A"})
    index.insert("hashB", {"chunk_id": "B"})
    index.insert("hashC", {"chunk_id": "C"})

    chunks = [
        {
            "chunk_id": "A",
            "hash": "hashA",
            "size": 100,
        },
        {
            "chunk_id": "B",
            "hash": "hashB",
            "size": 100,
        },
        {
            "chunk_id": "C",
            "hash": "hashC",
            "size": 100,
        },
    ]

    engine = DeduplicationEngine(index)

    result = engine.compute(
        file_id="file-1",
        version=2,
        chunks=chunks,
    )

    assert result.total_chunks == 3
    assert result.unique_chunks == 0
    assert result.duplicate_chunks == 3

    assert result.original_size == 300
    assert result.delta_size == 0
    assert result.savings_ratio == 1.0


def test_completely_different_file():

    index = FakeHashIndex()

    # Existing data
    index.insert("hashA", {"chunk_id": "A"})
    index.insert("hashB", {"chunk_id": "B"})

    chunks = [
        {
            "chunk_id": "X",
            "hash": "hashX",
            "size": 100,
        },
        {
            "chunk_id": "Y",
            "hash": "hashY",
            "size": 100,
        },
    ]

    engine = DeduplicationEngine(index)

    result = engine.compute(
        file_id="file-2",
        version=1,
        chunks=chunks,
    )

    assert result.total_chunks == 2
    assert result.unique_chunks == 2
    assert result.duplicate_chunks == 0

    assert result.original_size == 200
    assert result.delta_size == 200
    assert result.savings_ratio == 0.0


def test_partially_modified_file():

    index = FakeHashIndex()

    # Original:
    # A B C D

    index.insert("hashA", {"chunk_id": "A"})
    index.insert("hashB", {"chunk_id": "B"})
    index.insert("hashC", {"chunk_id": "C"})
    index.insert("hashD", {"chunk_id": "D"})

    # Modified:
    # A B X D

    chunks = [
        {
            "chunk_id": "A",
            "hash": "hashA",
            "size": 100,
        },
        {
            "chunk_id": "B",
            "hash": "hashB",
            "size": 100,
        },
        {
            "chunk_id": "X",
            "hash": "hashX",
            "size": 100,
        },
        {
            "chunk_id": "D",
            "hash": "hashD",
            "size": 100,
        },
    ]

    engine = DeduplicationEngine(index)

    result = engine.compute(
        file_id="file-1",
        version=2,
        chunks=chunks,
    )

    assert result.total_chunks == 4
    assert result.unique_chunks == 1
    assert result.duplicate_chunks == 3

    assert result.original_size == 400
    assert result.delta_size == 100
    assert result.savings_ratio == 0.75


def test_empty_file():

    index = FakeHashIndex()

    engine = DeduplicationEngine(index)

    result = engine.compute(
        file_id="empty-file",
        version=1,
        chunks=[],
    )

    assert result.total_chunks == 0
    assert result.unique_chunks == 0
    assert result.duplicate_chunks == 0

    assert result.original_size == 0
    assert result.delta_size == 0
    assert result.savings_ratio == 0.0


def test_index_version_mismatch():

    index = FakeHashIndex(
        index_version="v2"
    )

    engine = DeduplicationEngine(index)

    with pytest.raises(IndexVersionMismatchError):

        engine.compute(
            file_id="file-1",
            version=2,
            chunks=[],
            expected_index_version="v1",
        )


def test_index_version_match():

    index = FakeHashIndex(
        index_version="v2"
    )

    engine = DeduplicationEngine(index)

    result = engine.compute(
        file_id="file-1",
        version=2,
        chunks=[],
        expected_index_version="v2",
    )

    assert result.index_version == "v2"