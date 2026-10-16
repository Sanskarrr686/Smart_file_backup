import hashlib


EMPTY_MERKLE_ROOT = hashlib.sha256(b"").hexdigest()


def sha256(data: str) -> str:
    """Return the SHA-256 hexadecimal digest of a string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def merkle_root_or_empty(chunk_hashes: list[str]) -> str:
    if not chunk_hashes:
        return EMPTY_MERKLE_ROOT
    return build_merkle_root(chunk_hashes)


def localize_corrupted_chunks(
    chunk_hashes: list[str],
    reference_chunk_hashes: list[str] | None,
    verified: bool,
) -> tuple[list[int], list[int]]:
    """
    Identify corrupted leaves when a reference hash list is provided.

    A root mismatch without reference hashes cannot isolate a leaf, so
    every index is reported as corrupted.
    """
    if verified:
        return list(range(len(chunk_hashes))), []

    if reference_chunk_hashes is None:
        return [], list(range(len(chunk_hashes)))

    verified_chunks = []
    corrupted_chunks = []
    max_len = max(len(chunk_hashes), len(reference_chunk_hashes))
    for index in range(max_len):
        current = chunk_hashes[index] if index < len(chunk_hashes) else None
        expected = (
            reference_chunk_hashes[index]
            if index < len(reference_chunk_hashes)
            else None
        )
        if current == expected and current is not None:
            verified_chunks.append(index)
        else:
            corrupted_chunks.append(index)
    return verified_chunks, corrupted_chunks


def build_merkle_root(chunk_hashes: list[str]) -> str:
    """
    Build a Merkle tree from ordered chunk hashes.

    If a level has an odd number of hashes,
    the last hash is duplicated.
    """
    if not chunk_hashes:
        raise ValueError("chunk_hashes cannot be empty")

    current_level = chunk_hashes.copy()

    while len(current_level) > 1:
        if len(current_level) % 2 != 0:
            current_level.append(current_level[-1])

        next_level = []

        for i in range(0, len(current_level), 2):
            combined = current_level[i] + current_level[i + 1]
            parent_hash = sha256(combined)
            next_level.append(parent_hash)

        current_level = next_level

    return current_level[0]