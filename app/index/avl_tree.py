"""
AVL Tree implementation for the Team B hash index.

Stores chunk hashes as keys and chunk references as values.
"""


class AVLNode:
    """Node used by the AVL tree."""

    def __init__(self, key: str, value: str):
        self.key = key
        self.value = value
        self.left = None
        self.right = None
        self.height = 1


class AVLTree:
    """Self-balancing AVL tree for chunk-hash lookup."""

    INDEX_VERSION = "v1"

    def __init__(self):
        self.root = None

    @property
    def index_version(self):
        """Return the index version."""
        return self.INDEX_VERSION

    def _height(self, node):
        if node is None:
            return 0
        return node.height

    def _update_height(self, node):
        node.height = 1 + max(
            self._height(node.left),
            self._height(node.right),
        )

    def _balance_factor(self, node):
        if node is None:
            return 0

        return self._height(node.left) - self._height(node.right)

    def _rotate_right(self, y):
        x = y.left
        middle = x.right

        x.right = y
        y.left = middle

        self._update_height(y)
        self._update_height(x)

        return x

    def _rotate_left(self, x):
        y = x.right
        middle = y.left

        y.left = x
        x.right = middle

        self._update_height(x)
        self._update_height(y)

        return y

    def _insert(self, node, key, value):
        if node is None:
            return AVLNode(key, value)

        if key < node.key:
            node.left = self._insert(node.left, key, value)

        elif key > node.key:
            node.right = self._insert(node.right, key, value)

        else:
            # Update existing value.
            node.value = value
            return node

        self._update_height(node)

        balance = self._balance_factor(node)

        # Left-left case
        if balance > 1 and key < node.left.key:
            return self._rotate_right(node)

        # Right-right case
        if balance < -1 and key > node.right.key:
            return self._rotate_left(node)

        # Left-right case
        if balance > 1 and key > node.left.key:
            node.left = self._rotate_left(node.left)
            return self._rotate_right(node)

        # Right-left case
        if balance < -1 and key < node.right.key:
            node.right = self._rotate_right(node.right)
            return self._rotate_left(node)

        return node

    def insert(self, key: str, value: str) -> None:
        """Insert or update a key-value pair."""

        if not isinstance(key, str) or not key:
            raise ValueError("key must be a non-empty string")

        if not isinstance(value, str) or not value:
            raise ValueError("value must be a non-empty string")

        self.root = self._insert(self.root, key, value)

    def search(self, key: str):
        """Simple search that returns the value or None."""
        return self.lookup(key)

    def lookup(self, key: str):
        """Return the value associated with a key, or None."""

        current = self.root

        while current is not None:
            if key == current.key:
                return current.value

            if key < current.key:
                current = current.left
            else:
                current = current.right

        return None

    def contains(self, key: str) -> bool:
        """Return True if the key exists."""
        return self.lookup(key) is not None

    def _min_node(self, node):
        current = node

        while current.left is not None:
            current = current.left

        return current

    def _delete(self, node, key):
        if node is None:
            return None

        if key < node.key:
            node.left = self._delete(node.left, key)

        elif key > node.key:
            node.right = self._delete(node.right, key)

        else:
            # No child or one child.
            if node.left is None:
                return node.right

            if node.right is None:
                return node.left

            # Two children.
            successor = self._min_node(node.right)
            node.key = successor.key
            node.value = successor.value
            node.right = self._delete(node.right, successor.key)

        self._update_height(node)

        balance = self._balance_factor(node)

        # Left-left
        if balance > 1 and self._balance_factor(node.left) >= 0:
            return self._rotate_right(node)

        # Left-right
        if balance > 1 and self._balance_factor(node.left) < 0:
            node.left = self._rotate_left(node.left)
            return self._rotate_right(node)

        # Right-right
        if balance < -1 and self._balance_factor(node.right) <= 0:
            return self._rotate_left(node)

        # Right-left
        if balance < -1 and self._balance_factor(node.right) > 0:
            node.right = self._rotate_right(node.right)
            return self._rotate_left(node)

        return node

    def remove(self, key: str) -> bool:
        """Remove a key and return True if it existed."""

        if not self.contains(key):
            return False

        self.root = self._delete(self.root, key)
        return True

    def size(self) -> int:
        """Return number of nodes in the tree."""

        def count(node):
            if node is None:
                return 0

            return 1 + count(node.left) + count(node.right)

        return count(self.root)

    def items(self):
        """Return stored key-value pairs in order."""

        collected = []

        def walk(node):
            if node is None:
                return
            walk(node.left)
            collected.append((node.key, node.value))
            walk(node.right)

        walk(self.root)
        return collected

    def clear(self) -> None:
        """Remove all nodes."""
        self.root = None

    def get_height(self) -> int:
        """Return tree height."""
        return self._height(self.root)