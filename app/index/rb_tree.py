"""
Red-Black Tree implementation for the Team B hash index.

Stores chunk hashes as keys and chunk references as values.
"""


class RBNode:
    """Node used by the Red-Black Tree."""

    RED = True
    BLACK = False

    def __init__(self, key=None, value=None, color=BLACK):
        self.key = key
        self.value = value
        self.color = color
        self.left = None
        self.right = None
        self.parent = None


class RBTree:
    """Self-balancing Red-Black Tree for chunk-hash lookup."""

    INDEX_VERSION = "v1"

    def __init__(self):
        self.NIL = RBNode()
        self.NIL.color = RBNode.BLACK

        self.root = self.NIL
        self._size = 0

    @property
    def index_version(self):
        """Return the index version."""
        return self.INDEX_VERSION

    def _left_rotate(self, x):
        y = x.right

        x.right = y.left
        if y.left != self.NIL:
            y.left.parent = x

        y.parent = x.parent

        if x.parent == self.NIL:
            self.root = y
        elif x == x.parent.left:
            x.parent.left = y
        else:
            x.parent.right = y

        y.left = x
        x.parent = y

    def _right_rotate(self, x):
        y = x.left

        x.left = y.right
        if y.right != self.NIL:
            y.right.parent = x

        y.parent = x.parent

        if x.parent == self.NIL:
            self.root = y
        elif x == x.parent.right:
            x.parent.right = y
        else:
            x.parent.left = y

        y.right = x
        x.parent = y

    def _insert_fixup(self, z):
        while z.parent.color == RBNode.RED:
            if z.parent == z.parent.parent.left:
                y = z.parent.parent.right

                if y.color == RBNode.RED:
                    z.parent.color = RBNode.BLACK
                    y.color = RBNode.BLACK
                    z.parent.parent.color = RBNode.RED
                    z = z.parent.parent
                else:
                    if z == z.parent.right:
                        z = z.parent
                        self._left_rotate(z)

                    z.parent.color = RBNode.BLACK
                    z.parent.parent.color = RBNode.RED
                    self._right_rotate(z.parent.parent)

            else:
                y = z.parent.parent.left

                if y.color == RBNode.RED:
                    z.parent.color = RBNode.BLACK
                    y.color = RBNode.BLACK
                    z.parent.parent.color = RBNode.RED
                    z = z.parent.parent
                else:
                    if z == z.parent.left:
                        z = z.parent
                        self._right_rotate(z)

                    z.parent.color = RBNode.BLACK
                    z.parent.parent.color = RBNode.RED
                    self._left_rotate(z.parent.parent)

        self.root.color = RBNode.BLACK
        self.root.parent = self.NIL

    def insert(self, key: str, value: str) -> None:
        """Insert or update a key-value pair."""

        if not isinstance(key, str) or not key:
            raise ValueError("key must be a non-empty string")

        if not isinstance(value, str) or not value:
            raise ValueError("value must be a non-empty string")

        parent = self.NIL
        current = self.root

        while current != self.NIL:
            parent = current

            if key == current.key:
                current.value = value
                return

            if key < current.key:
                current = current.left
            else:
                current = current.right

        node = RBNode(key, value, RBNode.RED)
        node.left = self.NIL
        node.right = self.NIL
        node.parent = parent

        if parent == self.NIL:
            self.root = node
        elif key < parent.key:
            parent.left = node
        else:
            parent.right = node

        self._size += 1
        self._insert_fixup(node)

    def search(self, key: str):
        """Simple search that returns the value or None."""
        return self.lookup(key)

    def lookup(self, key: str):
        """Return the value associated with a key, or None."""

        current = self.root

        while current != self.NIL:
            if key == current.key:
                return current.value

            if key < current.key:
                current = current.left
            else:
                current = current.right

        return None

    def contains(self, key: str) -> bool:
        """Return True when the key exists."""
        return self.lookup(key) is not None

    def size(self) -> int:
        """Return the number of stored keys."""
        return self._size

    def items(self):
        """Return stored key-value pairs in order."""

        collected = []

        def walk(node):
            if node == self.NIL:
                return
            walk(node.left)
            collected.append((node.key, node.value))
            walk(node.right)

        walk(self.root)
        return collected

    def remove(self, key: str) -> bool:
        """Remove a key by rebuilding the tree without it."""
        if not self.contains(key):
            return False

        remaining = [(item_key, value) for item_key, value in self.items() if item_key != key]
        self.clear()
        for item_key, value in remaining:
            self.insert(item_key, value)
        return True

    def clear(self) -> None:
        """Remove all entries."""
        self.root = self.NIL
        self._size = 0

    def get_height(self) -> int:
        """Return the tree height."""

        def height(node):
            if node == self.NIL:
                return 0

            return 1 + max(
                height(node.left),
                height(node.right),
            )

        return height(self.root)