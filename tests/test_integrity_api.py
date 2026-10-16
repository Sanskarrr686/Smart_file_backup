from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_integrity_verify_success():
    response = client.post(
        "/api/v1/integrity/verify",
        json={
            "chunk_hashes": ["hash1", "hash2"],
            "expected_merkle_root": (
                "d8eab8000c5826fbf21e6340c96a911c"
                "7cf362c054695b73cb1a80ad0dac1cb0"
            ),
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["verified"] is True
    assert data["merkle_root"] == (
        "d8eab8000c5826fbf21e6340c96a911c"
        "7cf362c054695b73cb1a80ad0dac1cb0"
    )


def test_integrity_verify_missing_chunk_hashes():
    response = client.post(
        "/api/v1/integrity/verify",
        json={
            "expected_merkle_root": "0" * 64,
        },
    )

    assert response.status_code == 422


def test_integrity_verify_missing_expected_root():
    response = client.post(
        "/api/v1/integrity/verify",
        json={
            "chunk_hashes": ["hash1"],
        },
    )

    assert response.status_code == 422