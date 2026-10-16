from app.index.avl_tree import AVLTree


def test_insert_and_lookup():
    tree = AVLTree()

    tree.insert("hash_003", "chunk_003")
    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")

    assert tree.lookup("hash_001") == "chunk_001"
    assert tree.lookup("hash_002") == "chunk_002"
    assert tree.lookup("hash_003") == "chunk_003"


def test_missing_key():
    tree = AVLTree()

    tree.insert("hash_001", "chunk_001")

    assert tree.lookup("missing") is None


def test_contains():
    tree = AVLTree()

    tree.insert("hash_001", "chunk_001")

    assert tree.contains("hash_001") is True
    assert tree.contains("missing") is False


def test_size():
    tree = AVLTree()

    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")
    tree.insert("hash_003", "chunk_003")

    assert tree.size() == 3


def test_remove():
    tree = AVLTree()

    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")

    assert tree.remove("hash_001") is True
    assert tree.lookup("hash_001") is None
    assert tree.size() == 1


def test_remove_missing_key():
    tree = AVLTree()

    assert tree.remove("missing") is False


def test_clear():
    tree = AVLTree()

    tree.insert("hash_001", "chunk_001")
    tree.insert("hash_002", "chunk_002")

    tree.clear()

    assert tree.size() == 0
    assert tree.get_height() == 0


def test_avl_tree_balances():
    tree = AVLTree()

    tree.insert("1", "chunk_1")
    tree.insert("2", "chunk_2")
    tree.insert("3", "chunk_3")

    assert tree.get_height() <= 2