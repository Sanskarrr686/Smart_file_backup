from app.chunking.fixed import fixed_size_chunks


def test_fixed_size_chunking():
    test_file = "test_files/sample.txt"

    chunks = fixed_size_chunks(test_file, 4096)

    assert len(chunks) == 5

    assert chunks[0]["size"] == 4096
    assert chunks[1]["size"] == 4096
    assert chunks[2]["size"] == 4096
    assert chunks[3]["size"] == 4096
    assert chunks[4]["size"] == 3616

    assert chunks[0]["offset"] == 0
    assert chunks[1]["offset"] == 4096
    assert chunks[2]["offset"] == 8192
    assert chunks[3]["offset"] == 12288
    assert chunks[4]["offset"] == 16384

    assert chunks[0]["chunk_id"] == "C001"
    assert chunks[1]["chunk_id"] == "C002"
    assert chunks[2]["chunk_id"] == "C003"
    assert chunks[3]["chunk_id"] == "C004"
    assert chunks[4]["chunk_id"] == "C005"

    total_size = sum(chunk["size"] for chunk in chunks)
    assert total_size == 20000