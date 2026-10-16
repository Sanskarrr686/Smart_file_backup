from pathlib import Path

from app.chunking.bytes_io import load_file_bytes
from app.chunking.rabin_karp import rabin_karp_chunks


def content_defined_chunks(
    file_path,
    min_size=2048,
    avg_size=4096,
    max_size=8192,
    hash_algorithm="sha256",
    file_id="local-file",
):
    """
    Split a file into content-defined chunks.

    Boundaries are chosen with a Rabin-Karp rolling hash so that
    insertions shift only nearby chunks (CDC vs fixed-size).
    """
    data = load_file_bytes(file_path)
    return rabin_karp_chunks(
        data,
        min_size=min_size,
        avg_size=avg_size,
        max_size=max_size,
        hash_algorithm=hash_algorithm,
        file_id=file_id,
    )


if __name__ == "__main__":
    file_path = Path("test_files/sample.txt")
    chunks = content_defined_chunks(file_path)
    print("Content-Defined Chunking (Rabin-Karp)")
    print(f"Total chunks: {len(chunks)}")
    for chunk in chunks:
        print(
            f"{chunk['chunk_id']} | "
            f"Offset: {chunk['offset']} | "
            f"Size: {chunk['size']} bytes"
        )
