from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

from app.chunking.rabin_karp import rabin_karp_chunks
from app.hashing.hasher import Hasher


def load_file_bytes(file_path: str | Path) -> bytes:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return path.read_bytes()


def fixed_size_chunks_from_bytes(
    data: bytes,
    chunk_size: int = 4096,
    hash_algorithm: str = "sha256",
    file_id: str = "local-file",
) -> list[dict]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")

    hasher = Hasher(hash_algorithm)
    chunks = []
    offset = 0
    chunk_number = 1

    while offset < len(data):
        chunk_data = data[offset:offset + chunk_size]
        digest = hasher.hash(chunk_data)
        chunks.append(
            {
                "chunk_id": str(
                    uuid5(
                        NAMESPACE_URL,
                        f"{file_id}:{offset}:{len(chunk_data)}:{digest}",
                    )
                ),
                "chunk_number": chunk_number,
                "offset": offset,
                "size": len(chunk_data),
                "hash": digest,
            }
        )
        offset += len(chunk_data)
        chunk_number += 1

    return chunks
