"""MinIO-backed chunk and manifest storage for Team B."""

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any, Iterator


class MinioConfigurationError(RuntimeError):
    """Raised when MinIO is requested but is not configured."""


@dataclass(frozen=True)
class MinioSettings:
    endpoint: str
    access_key: str
    secret_key: str
    bucket: str
    secure: bool = False
    provider: str = "minio"

    @classmethod
    def _read_value(cls, *names: str) -> str:
        for name in names:
            value = os.getenv(name, "").strip()
            if value:
                return value
        return ""

    @classmethod
    def from_env(cls) -> "MinioSettings":
        endpoint = cls._read_value(
            "STORAGE_ENDPOINT",
            "MINIO_ENDPOINT",
        )
        access_key = cls._read_value(
            "STORAGE_ACCESS_KEY",
            "MINIO_ACCESS_KEY",
        )
        secret_key = cls._read_value(
            "STORAGE_SECRET_KEY",
            "MINIO_SECRET_KEY",
        )
        bucket = cls._read_value(
            "STORAGE_BUCKET",
            "MINIO_BUCKET",
        )
        secure = (
            os.getenv("STORAGE_USE_SSL", os.getenv("MINIO_SECURE", "false"))
            .strip()
            .lower()
        )
        provider = os.getenv("STORAGE_PROVIDER", "").strip().lower()
        if not provider and "backblazeb2.com" in (os.getenv("STORAGE_ENDPOINT", "") or ""):
            provider = "backblaze-b2"
        if not provider and "backblazeb2.com" in (os.getenv("MINIO_ENDPOINT", "") or ""):
            provider = "backblaze-b2"
        if not provider:
            provider = "minio"

        missing = [
            name
            for name, value in (
                ("STORAGE_ENDPOINT / MINIO_ENDPOINT", endpoint),
                ("STORAGE_ACCESS_KEY / MINIO_ACCESS_KEY", access_key),
                ("STORAGE_SECRET_KEY / MINIO_SECRET_KEY", secret_key),
                ("STORAGE_BUCKET / MINIO_BUCKET", bucket),
            )
            if not value
        ]
        if missing:
            raise MinioConfigurationError(
                "Storage configuration is incomplete; set: "
                + ", ".join(missing)
            )
        if secure not in {"true", "false"}:
            raise MinioConfigurationError(
                "STORAGE_USE_SSL / MINIO_SECURE must be 'true' or 'false'"
            )

        endpoint = endpoint.removeprefix("http://").removeprefix("https://")
        return cls(
            endpoint=endpoint.rstrip("/"),
            access_key=access_key,
            secret_key=secret_key,
            bucket=bucket,
            secure=secure == "true",
            provider=provider,
        )


class MinioStore:
    """Small storage boundary; Team B state is namespaced in the shared bucket."""

    SYSTEM_PREFIX = "_team_b"

    def __init__(self, client: Any, default_bucket: str, provider: str | None = None) -> None:
        self.client = client
        self.default_bucket = default_bucket
        self.provider = (
            provider
            or os.getenv("STORAGE_PROVIDER", "").strip().lower()
            or "minio"
        ).lower()

    @classmethod
    def from_env(cls) -> "MinioStore":
        settings = MinioSettings.from_env()
        try:
            from minio import Minio
        except ImportError as exc:
            raise MinioConfigurationError(
                "The 'minio' package is required for MinIO storage"
            ) from exc

        client = Minio(
            settings.endpoint,
            access_key=settings.access_key,
            secret_key=settings.secret_key,
            secure=settings.secure,
        )
        return cls(client, settings.bucket, settings.provider)

    @classmethod
    def optional_from_env(cls) -> "MinioStore | None":
        names = (
            "STORAGE_ENDPOINT",
            "STORAGE_ACCESS_KEY",
            "STORAGE_SECRET_KEY",
            "STORAGE_BUCKET",
            "MINIO_ENDPOINT",
            "MINIO_ACCESS_KEY",
            "MINIO_SECRET_KEY",
            "MINIO_BUCKET",
        )
        if not any(os.getenv(name) for name in names):
            return None
        return cls.from_env()

    @staticmethod
    def _identifier(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def _read_object(response: Any) -> bytes:
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_bytes(self, bucket: str, object_name: str) -> bytes:
        return self._read_object(self.client.get_object(bucket, object_name))

    def put_bytes(
        self,
        bucket: str,
        object_name: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        from io import BytesIO

        self.client.put_object(
            bucket,
            object_name,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    def object_size(self, bucket: str, object_name: str) -> int | None:
        try:
            return int(self.client.stat_object(bucket, object_name).size)
        except Exception as exc:
            code = getattr(exc, "code", None)
            if code in {"NoSuchKey", "NoSuchObject", "NotFound"}:
                return None
            raise

    @staticmethod
    def chunk_object_name(algorithm: str, digest: str) -> str:
        return f"chunks/{algorithm}/{digest[:2]}/{digest}"

    def put_chunk_if_missing(
        self,
        bucket: str,
        algorithm: str,
        digest: str,
        data: bytes,
    ) -> tuple[str, bool]:
        object_name = self.chunk_object_name(algorithm, digest)
        current_size = self.object_size(bucket, object_name)
        if current_size is not None:
            if current_size != len(data):
                raise ValueError(
                    f"Stored chunk size mismatch for hash {digest}"
                )
            return object_name, False

        self.put_bytes(bucket, object_name, data)
        return object_name, True

    def iter_object_chunks(
        self,
        bucket: str,
        object_name: str,
        chunk_size: int,
    ) -> Iterator[bytes]:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be greater than 0")

        response = self.client.get_object(bucket, object_name)
        buffer = bytearray()
        try:
            while True:
                part = response.read(chunk_size)
                if not part:
                    break
                buffer.extend(part)
                while len(buffer) >= chunk_size:
                    yield bytes(buffer[:chunk_size])
                    del buffer[:chunk_size]
            if buffer:
                yield bytes(buffer)
        finally:
            response.close()
            response.release_conn()

    def _manifest_prefix(self, backup_id: str) -> str:
        return (
            f"{self.SYSTEM_PREFIX}/manifests/"
            f"{self._identifier(backup_id)}/"
        )

    def save_manifest(self, manifest: dict[str, Any]) -> str:
        backup_id = str(manifest["backup_id"])
        file_id = str(manifest["file_id"])
        version_id = str(manifest["version_id"])
        object_name = (
            f"{self._manifest_prefix(backup_id)}"
            f"{self._identifier(file_id)}/"
            f"{self._identifier(version_id)}.json"
        )
        self.put_bytes(
            self.default_bucket,
            object_name,
            json.dumps(manifest, separators=(",", ":")).encode("utf-8"),
            "application/json",
        )
        return object_name

    def get_manifests(self, backup_id: str) -> list[dict[str, Any]]:
        prefix = self._manifest_prefix(backup_id)
        objects = self.client.list_objects(
            self.default_bucket,
            prefix=prefix,
            recursive=True,
        )
        manifests = []
        for item in objects:
            if not item.object_name.endswith(".json"):
                continue
            manifest = json.loads(
                self.get_bytes(
                    self.default_bucket,
                    item.object_name,
                ).decode("utf-8")
            )
            if manifest.get("backup_id") == backup_id:
                manifests.append(manifest)
        return sorted(
            manifests,
            key=lambda item: (
                str(item.get("file_id", "")),
                str(item.get("version_id", "")),
            ),
        )

    def save_result(self, result: dict[str, Any]) -> None:
        result_id = str(result["dedup_result_id"])
        object_name = (
            f"{self.SYSTEM_PREFIX}/results/"
            f"{self._identifier(result_id)}.json"
        )
        self.put_bytes(
            self.default_bucket,
            object_name,
            json.dumps(result, separators=(",", ":")).encode("utf-8"),
            "application/json",
        )

    def get_result(self, result_id: str) -> dict[str, Any] | None:
        object_name = (
            f"{self.SYSTEM_PREFIX}/results/"
            f"{self._identifier(result_id)}.json"
        )
        if self.object_size(self.default_bucket, object_name) is None:
            return None
        return json.loads(
            self.get_bytes(self.default_bucket, object_name).decode("utf-8")
        )

    def save_integrity_result(
        self,
        backup_id: str,
        result: dict[str, Any],
    ) -> None:
        object_name = (
            f"{self.SYSTEM_PREFIX}/integrity-results/"
            f"{self._identifier(backup_id)}.json"
        )
        self.put_bytes(
            self.default_bucket,
            object_name,
            json.dumps(result, separators=(",", ":")).encode("utf-8"),
            "application/json",
        )

    def get_integrity_result(
        self,
        backup_id: str,
    ) -> dict[str, Any] | None:
        object_name = (
            f"{self.SYSTEM_PREFIX}/integrity-results/"
            f"{self._identifier(backup_id)}.json"
        )
        if self.object_size(self.default_bucket, object_name) is None:
            return None
        return json.loads(
            self.get_bytes(self.default_bucket, object_name).decode("utf-8")
        )

    def get_chunk_statistics(self) -> dict[str, int]:
        objects = self.client.list_objects(
            self.default_bucket,
            prefix="chunks/",
            recursive=True,
        )
        count = 0
        total_bytes = 0
        for item in objects:
            count += 1
            total_bytes += int(item.size or 0)
        return {"unique_chunks": count, "total_size_bytes": total_bytes}

    def get_dedup_statistics(self) -> dict[str, int | float]:
        objects = self.client.list_objects(
            self.default_bucket,
            prefix=f"{self.SYSTEM_PREFIX}/manifests/",
            recursive=True,
        )
        manifest_count = 0
        total_chunks = 0
        original_bytes = 0
        chunk_references: set[tuple[str, str]] = set()
        for item in objects:
            if not item.object_name.endswith(".json"):
                continue
            manifest = json.loads(
                self.get_bytes(
                    self.default_bucket,
                    item.object_name,
                ).decode("utf-8")
            )
            manifest_count += 1
            total_chunks += int(manifest["total_chunks"])
            original_bytes += int(manifest["original_size"])
            for chunk in manifest.get("chunks", []):
                chunk_references.add(
                    (
                        str(chunk.get("bucket") or self.default_bucket),
                        str(chunk["object_key"]),
                    )
                )
        stored_bytes = 0
        for bucket, object_name in chunk_references:
            size = self.object_size(bucket, object_name)
            if size is not None:
                stored_bytes += size
        unique_chunks = len(chunk_references)
        return {
            "manifest_count": manifest_count,
            "total_chunks": total_chunks,
            "unique_chunks": unique_chunks,
            "duplicate_chunks": total_chunks - unique_chunks,
            "original_bytes": original_bytes,
            "stored_bytes": stored_bytes,
            "bytes_saved": max(0, original_bytes - stored_bytes),
            "savings_ratio": (
                max(0, original_bytes - stored_bytes) / original_bytes
                if original_bytes
                else 0.0
            ),
        }
