from app.index.rb_tree import RBTree


def test_insert_and_lookup():
    tree = RBTree()

    tree.insert("hash_003", "chunk_003")
    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")

    assert tree.lookup("hash_001") == "chunk_001"
    assert tree.lookup("hash_002") == "chunk_002"
    assert tree.lookup("hash_003") == "chunk_003"


def test_missing_key():
    tree = RBTree()

    tree.insert("hash_001", "chunk_001")

    assert tree.lookup("missing") is None


def test_contains():
    tree = RBTree()

    tree.insert("hash_001", "chunk_001")

    assert tree.contains("hash_001") is True
    assert tree.contains("missing") is False


def test_size():
    tree = RBTree()

    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")
    tree.insert("hash_003", "chunk_003")

    assert tree.size() == 3


def test_update_existing_key():
    tree = RBTree()

    tree.insert("hash_001", "chunk_old")
    tree.insert("hash_001", "chunk_new")

    assert tree.lookup("hash_001") == "chunk_new"
    assert tree.size() == 1


def test_clear():
    tree = RBTree()

    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")

    tree.clear()

    assert tree.size() == 0
    assert tree.lookup("hash_001") is None


def test_tree_has_root_after_insert():
    tree = RBTree()

    tree.insert("hash_001", "chunk_001")

    assert tree.root != tree.NIL
    assert tree.root.color is False


def test_invalid_key():
    tree = RBTree()

    try:
        tree.insert("", "chunk_001")
        assert False
    except ValueError:
        assert True


def test_invalid_value():
    tree = RBTree()

    try:
        tree.insert("hash_001", "")
        assert False
    except ValueError:
        assert True