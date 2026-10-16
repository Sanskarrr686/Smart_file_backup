from pathlib import Path


DEFAULT_CHUNK_SIZE = 4096  # 4 KB


def fixed_size_chunks(file_path, chunk_size=DEFAULT_CHUNK_SIZE):
    """
    Split a file into fixed-size chunks.

    Args:
        file_path: Path of the input file.
        chunk_size: Chunk size in bytes.

    Returns:
        List of chunk dictionaries.
    """

    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if chunk_size <= 0:
        raise ValueError("Chunk size must be greater than 0")

    chunks = []

    with open(file_path, "rb") as file:
        chunk_number = 1

        while True:
            data = file.read(chunk_size)

            if not data:
                break

            chunks.append({
                "chunk_id": f"C{chunk_number:03d}",
                "chunk_number": chunk_number,
                "offset": (chunk_number - 1) * chunk_size,
                "size": len(data),
                "data": data
            })

            chunk_number += 1

    return chunks


if __name__ == "__main__":

    # Test file
    test_file = Path("test_files/sample.txt")

    chunks = fixed_size_chunks(test_file)

    print("Fixed-Size Chunking")
    print("=" * 60)
    print(f"File       : {test_file}")
    print(f"Chunk size : {DEFAULT_CHUNK_SIZE} bytes (4 KB)")
    print(f"Total chunks: {len(chunks)}")
    print("=" * 60)

    for chunk in chunks:
        print(
            f"{chunk['chunk_id']} | "
            f"Offset: {chunk['offset']} | "
            f"Size: {chunk['size']} bytes"
        )