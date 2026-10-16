from io import BytesIO
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.routes_dedup import dedup_results
from app.main import app
from app.services.minio_store import MinioStore


class MissingObject(Exception):
    code = "NoSuchKey"


class FakeResponse(BytesIO):
    def release_conn(self):
        pass


class FakeMinio:
    def __init__(self, objects):
        self.objects = dict(objects)

    def get_object(self, bucket, object_name):
        try:
            return FakeResponse(self.objects[(bucket, object_name)])
        except KeyError as exc:
            raise MissingObject(object_name) from exc

    def put_object(
        self,
        bucket,
        object_name,
        stream,
        length,
        content_type=None,
    ):
        self.objects[(bucket, object_name)] = stream.read(length)

    def stat_object(self, bucket, object_name):
        try:
            value = self.objects[(bucket, object_name)]
        except KeyError as exc:
            raise MissingObject(object_name) from exc
        return SimpleNamespace(size=len(value))

    def list_objects(self, bucket, prefix="", recursive=False):
        return [
            SimpleNamespace(object_name=key, size=len(value))
            for (object_bucket, key), value in self.objects.items()
            if object_bucket == bucket and key.startswith(prefix)
        ]


def test_minio_dedup_persists_result_and_verifies_actual_chunks(monkeypatch):
    bucket = "backup-test"
    source_key = "incoming/report.bin"
    fake_client = FakeMinio({(bucket, source_key): b"abcdabcd"})
    store = MinioStore(fake_client, bucket)
    monkeypatch.setattr(MinioStore, "from_env", classmethod(lambda cls: store))
    monkeypatch.setattr(
        MinioStore,
        "optional_from_env",
        classmethod(lambda cls: store),
    )
    dedup_results.clear()
    client = TestClient(app)

    response = client.post(
        "/api/v1/dedup/compute",
        json={
            "backup_id": "backup-1",
            "file_id": "file-1",
            "version_id": "version-1",
            "storage": {
                "provider": "minio",
                "bucket": bucket,
                "key": source_key,
            },
            "chunk_size": 4,
        },
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["total_chunks"] == 2
    assert result["unique_chunks"] == 1
    assert result["duplicate_chunks"] == 1
    assert result["bytes_saved"] == 4
    assert len(result["chunk_manifest"]) == 2

    result_id = result["dedup_result_id"]
    dedup_results.clear()
    lookup = client.get(f"/api/v1/dedup/{result_id}")
    assert lookup.status_code == 200
    assert lookup.json()["backup_id"] == "backup-1"

    verify = client.post(
        "/api/v1/integrity/verify",
        json={"backup_id": "backup-1"},
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["verified"] is True
    assert verify.json()["total_chunks"] == 2
    assert verify.json()["corrupted_chunk_count"] == 0

    verify_lookup = client.get("/api/v1/integrity/backup-1")
    assert verify_lookup.status_code == 200
    assert verify_lookup.json()["status"] == "VERIFIED"

    chunk_key = result["chunk_manifest"][0]["object_key"]
    fake_client.objects[(bucket, chunk_key)] = b"evil"
    corrupt_verify = client.post(
        "/api/v1/integrity/verify",
        json={"backup_id": "backup-1"},
    )
    assert corrupt_verify.status_code == 200
    assert corrupt_verify.json()["verified"] is False
    assert corrupt_verify.json()["corrupted_chunk_count"] == 2
