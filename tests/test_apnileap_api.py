from fastapi.testclient import TestClient
import hashlib
import time

from app.api.routes_chunks import chunk_registry
from app.api.routes_dedup import dedup_results, index
from app.main import app
from app.merkle.tree import build_merkle_root


client = TestClient(app)


def setup_function():
    chunk_registry.clear()
    dedup_results.clear()
    index.clear()


def test_chunk_registration_and_index_summary():
    response = client.put(
        "/internal/v1/chunks/chunk-1",
        json={
            "file_id": "file-1",
            "version_id": "v1",
            "chunk_index": 0,
            "hash_value": "hash-1",
            "size_bytes": 128,
        },
    )

    assert response.status_code == 200
    assert response.json()["chunk_id"] == "chunk-1"

    response = client.get("/api/v1/chunks/index")

    assert response.status_code == 200
    assert response.json()["total_chunks"] == 1
    assert response.json()["total_size_bytes"] == 128


def test_dedup_compute_and_result_lookup(tmp_path):
    file_path = tmp_path / "sample.txt"
    file_path.write_bytes(b"abcdefgh")

    response = client.post(
        "/api/v1/dedup/compute",
        json={
            "file_id": "file-1",
            "version": 1,
            "file_path": str(file_path),
            "chunk_size": 4,
        },
    )

    assert response.status_code == 200
    result = response.json()
    result_id = result["dedup_result_id"]

    response = client.get(f"/api/v1/dedup/{result_id}")

    assert response.status_code == 200
    assert response.json()["dedup_result_id"] == result_id


def test_hash_lookup_and_cache_invalidation(tmp_path):
    file_path = tmp_path / "sample.txt"
    file_path.write_bytes(b"abcdefgh")

    client.post(
        "/api/v1/dedup/compute",
        json={
            "file_id": "file-1",
            "file_path": str(file_path),
            "chunk_size": 4,
        },
    )

    chunk_hash = next(iter(index._index))
    response = client.get(f"/internal/v1/hash-index/{chunk_hash}")

    assert response.status_code == 200
    assert response.json()["existing_chunk_ref"] == "C001"
    assert "index_statistics" in response.json()

    response = client.post(
        "/internal/v1/hash-cache/invalidate",
        json={"keys": [chunk_hash]},
    )

    assert response.status_code == 200
    assert response.json()["invalidated_count"] == 1
    assert index.size() == 1


def test_integrity_checksum_and_benchmark_contract():
    chunk_hashes = ["hash1", "hash2"]
    checksum = hashlib.sha256("hash1hash2".encode()).hexdigest()

    response = client.post(
        "/api/v1/integrity/verify",
        json={
            "chunk_hashes": chunk_hashes,
            "expected_merkle_root": checksum,
            "verification_algorithm": "checksum",
            "benchmark_size_bytes": 2048,
            "repetitions": 3,
        },
        headers={"X-Correlation-ID": "test-correlation"},
    )

    assert response.status_code == 200
    assert response.json()["verified"] is True
    assert response.json()["space_complexity"] == "O(1)"
    assert response.json()["benchmark"]["repetitions"] == 3
    assert response.headers["X-Correlation-ID"] == "test-correlation"
    assert response.headers["X-API-Version"] == "v1"
    assert response.json()["meta"]["api_version"] == "v1"


def test_integrity_api_localizes_corrupted_chunks():
    expected_chunks = ["hash1", "hash2"]
    expected_root = build_merkle_root(expected_chunks)

    response = client.post(
        "/api/v1/integrity/verify",
        json={
            "chunk_hashes": ["hash1", "changed"],
            "expected_chunk_hashes": expected_chunks,
            "expected_merkle_root": expected_root,
        },
    )

    assert response.status_code == 200
    assert response.json()["verified_chunks"] == [0]
    assert response.json()["corrupted_chunks"] == [1]


def test_dedup_metrics_endpoint_exposes_complexity_and_cache_stats():
    response = client.get("/api/v1/metrics/dedup")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "cache" in data
    assert "complexity" in data
    assert {result["index"] for result in data["results"]} == {
        "HashMap",
        "AVL",
        "RedBlack",
    }


def test_invalid_optimization_metric_is_rejected(tmp_path):
    file_path = tmp_path / "sample.txt"
    file_path.write_bytes(b"data")

    response = client.post(
        "/api/v1/dedup/compute",
        json={
            "file_id": "file-1",
            "file_path": str(file_path),
            "optimization_metric": "invalid",
        },
    )

    assert response.status_code == 400


def test_chunk_registration_expiry_removes_hash_from_lookup():
    response = client.put(
        "/internal/v1/chunks/expiring-chunk",
        json={
            "file_id": "file-1",
            "version_id": "v1",
            "chunk_index": 0,
            "hash_value": "expiring-hash",
            "size_bytes": 10,
            "expiry_seconds": 0.001,
        },
    )
    assert response.status_code == 200

    time.sleep(0.01)
    response = client.get("/internal/v1/hash-index/expiring-hash")

    assert response.status_code == 200
    assert response.json()["existing_chunk_ref"] is None


def test_configured_bearer_token_is_required(monkeypatch):
    monkeypatch.setenv("TEAM_B_API_TOKEN", "test-token")

    unauthorized = client.get("/api/v1/metrics/dedup")
    authorized = client.get(
        "/api/v1/metrics/dedup",
        headers={"Authorization": "Bearer test-token"},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200