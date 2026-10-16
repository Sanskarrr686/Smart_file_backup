import pytest

from app.merkle.tree import build_merkle_root


def test_merkle_root_with_two_hashes():
    hashes = ["hash1", "hash2"]

    root = build_merkle_root(hashes)

    assert root == "d8eab8000c5826fbf21e6340c96a911c7cf362c054695b73cb1a80ad0dac1cb0"


def test_merkle_root_with_odd_number_of_hashes():
    hashes = ["hash1", "hash2", "hash3"]

    root = build_merkle_root(hashes)

    assert root == "a8c1584ccf6a7fe81f80fd620460d86b48ab6549cee03a061cbf133a145e1dd9"


def test_empty_hash_list_raises_error():
    with pytest.raises(ValueError):
        build_merkle_root([])