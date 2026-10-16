"""Content-defined chunking using a Rabin-Karp rolling hash."""

from uuid import uuid5, NAMESPACE_URL

from app.hashing.hasher import Hasher


BASE = 257
MODULUS = 2**32
DEFAULT_WINDOW = 48


def _chunk_id(file_id: str, offset: int, size: int, digest: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"{file_id}:{offset}:{size}:{digest}"))


def rabin_karp_chunks(
    data: bytes,
    min_size: int = 2048,
    avg_size: int = 4096,
    max_size: int = 8192,
    window: int = DEFAULT_WINDOW,
    hash_algorithm: str = "sha256",
    file_id: str = "local-file",
) -> list[dict]:
    """
    Split bytes on Rabin-Karp rolling-hash boundaries.

    A cut is emitted when the rolling hash is congruent to 0 modulo
    avg_size, after min_size, and is forced at max_size.
    """
    if min_size <= 0 or avg_size <= 0 or max_size <= 0:
        raise ValueError("chunk size bounds must be greater than 0")
    if min_size > max_size:
        raise ValueError("min_size cannot exceed max_size")

    hasher = Hasher(hash_algorithm)
    if not data:
        return []

    mask = avg_size - 1
    power = pow(BASE, window, MODULUS)
    rolling = 0
    chunks = []
    start = 0

    for index, byte in enumerate(data):
        rolling = (rolling * BASE + byte) % MODULUS
        window_start = index - window
        if window_start >= start:
            outgoing = data[window_start]
            rolling = (rolling - outgoing * power) % MODULUS

        current_size = index - start + 1
        if current_size < min_size:
            continue

        at_max = current_size >= max_size
        at_boundary = (rolling & mask) == 0
        if at_max or at_boundary:
            chunk_data = data[start:index + 1]
            digest = hasher.hash(chunk_data)
            chunks.append(
                {
                    "chunk_id": _chunk_id(file_id, start, len(chunk_data), digest),
                    "chunk_number": len(chunks) + 1,
                    "offset": start,
                    "size": len(chunk_data),
                    "hash": digest,
                }
            )
            start = index + 1
            rolling = 0

    if start < len(data):
        chunk_data = data[start:]
        digest = hasher.hash(chunk_data)
        chunks.append(
            {
                "chunk_id": _chunk_id(file_id, start, len(chunk_data), digest),
                "chunk_number": len(chunks) + 1,
                "offset": start,
                "size": len(chunk_data),
                "hash": digest,
            }
        )

    return chunks
