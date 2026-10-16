"""MinIO-backed deduplication and integrity workflows."""

import hashlib
from typing import Any
from uuid import uuid4

from app.dedup.delta import calculate_savings_ratio
from app.hashing.hasher import Hasher
from app.merkle.tree import build_merkle_root
from app.services.minio_store import MinioStore


def deduplicate_minio_object(
    store: MinioStore,
    bucket: str,
    object_name: str,
    backup_id: str,
    file_id: str,
    version_id: str,
    chunk_size: int,
    hash_algorithm: str,
    storage_provider: str = "minio",
) -> tuple[dict[str, Any], dict[str, Any]]:
    hasher = Hasher(hash_algorithm)
    chunk_manifest = []
    ordered_hashes = []
    unique_chunks = 0
    original_size = 0
    delta_size = 0

    for chunk_number, data in enumerate(
        store.iter_object_chunks(bucket, object_name, chunk_size),
        start=1,
    ):
        digest = hasher.hash(data)
        chunk_object, is_new = store.put_chunk_if_missing(
            bucket,
            hash_algorithm,
            digest,
            data,
        )
        size = len(data)
        original_size += size
        if is_new:
            unique_chunks += 1
            delta_size += size
        ordered_hashes.append(digest)
        chunk_manifest.append(
            {
                "chunk_index": chunk_number - 1,
                "offset": (chunk_number - 1) * chunk_size,
                "size_bytes": size,
                "hash": digest,
                "hash_algorithm": hash_algorithm,
                "bucket": bucket,
                "object_key": chunk_object,
            }
        )

    result_id = str(uuid4())
    total_chunks = len(chunk_manifest)
    merkle_root = build_merkle_root(ordered_hashes) if ordered_hashes else hashlib.sha256(b"").hexdigest()
    result = {
        "dedup_result_id": result_id,
        "result_id": result_id,
        "backup_id": backup_id,
        "file_id": file_id,
        "version_id": version_id,
        "version": version_id,
        "total_chunks": total_chunks,
        "unique_chunks": unique_chunks,
        "duplicate_chunks": total_chunks - unique_chunks,
        "original_size": original_size,
        "delta_size": delta_size,
        "bytes_saved": max(0, original_size - delta_size),
        "savings_ratio": calculate_savings_ratio(original_size, delta_size),
        "algorithm": hash_algorithm,
        "index_version": f"{storage_provider}-content-addressed-v1",
        "algorithm_version": "v1",
        "merkle_root": merkle_root,
        "index_backend": f"{storage_provider}-content-addressed",
        "status": "COMPLETED",
        "source": {"provider": storage_provider, "bucket": bucket, "key": object_name},
        "chunk_manifest": chunk_manifest,
    }
    manifest = {
        "backup_id": backup_id,
        "file_id": file_id,
        "version_id": version_id,
        "dedup_result_id": result_id,
        "hash_algorithm": hash_algorithm,
        "chunk_size": chunk_size,
        "total_chunks": total_chunks,
        "unique_chunks": unique_chunks,
        "duplicate_chunks": total_chunks - unique_chunks,
        "original_size": original_size,
        "delta_size": delta_size,
        "merkle_root": merkle_root,
        "chunks": chunk_manifest,
    }
    return result, manifest


def verify_minio_backup(
    store: MinioStore,
    backup_id: str,
) -> dict[str, Any]:
    manifests = store.get_manifests(backup_id)
    if not manifests:
        raise LookupError(f"No stored manifest found for backup_id '{backup_id}'")

    files = []
    all_expected_hashes = []
    all_actual_hashes = []
    total_chunks = 0
    verified_chunks = 0
    corrupted_chunks = 0
    verified_indices = []
    corrupted_indices = []

    for manifest in manifests:
        algorithm = str(manifest["hash_algorithm"])
        hasher = Hasher(algorithm)
        expected_hashes = []
        actual_hashes = []
        corrupt_indices = []
        for chunk in manifest["chunks"]:
            expected_hash = str(chunk["hash"])
            expected_hashes.append(expected_hash)
            chunk_bucket = str(
                chunk.get("bucket") or store.default_bucket
            )
            stored_size = store.object_size(
                chunk_bucket,
                str(chunk["object_key"]),
            )
            if stored_size is None:
                actual_hash = ""
            else:
                data = store.get_bytes(
                    chunk_bucket,
                    str(chunk["object_key"]),
                )
                actual_hash = hasher.hash(data)
                if len(data) != int(chunk["size_bytes"]):
                    actual_hash = ""
            actual_hashes.append(actual_hash)
            if actual_hash != expected_hash:
                corrupt_indices.append(int(chunk["chunk_index"]))

        expected_root = str(manifest["merkle_root"])
        actual_root = (
            build_merkle_root(actual_hashes)
            if actual_hashes and all(actual_hashes)
            else ""
        )
        file_verified = not corrupt_indices and actual_root == expected_root
        count = len(expected_hashes)
        total_chunks += count
        verified_chunks += count - len(corrupt_indices)
        corrupted_chunks += len(corrupt_indices)
        verified_indices.extend(
            int(chunk["chunk_index"])
            for chunk in manifest["chunks"]
            if int(chunk["chunk_index"]) not in corrupt_indices
        )
        corrupted_indices.extend(corrupt_indices)
        all_expected_hashes.extend(expected_hashes)
        all_actual_hashes.extend(actual_hashes)
        files.append(
            {
                "file_id": manifest["file_id"],
                "version_id": manifest["version_id"],
                "verified": file_verified,
                "expected_merkle_root": expected_root,
                "actual_merkle_root": actual_root,
                "total_chunks": count,
                "verified_chunks": count - len(corrupt_indices),
                "corrupted_chunks": len(corrupt_indices),
                "corrupted_chunk_indices": corrupt_indices,
            }
        )

    verified = all(item["verified"] for item in files)
    aggregate_root = (
        build_merkle_root(all_actual_hashes)
        if all_actual_hashes and all(all_actual_hashes)
        else ""
    )
    return {
        "backup_id": backup_id,
        "verified": verified,
        "status": "VERIFIED" if verified else "FAILED",
        "expected_merkle_root": (
            files[0]["expected_merkle_root"] if len(files) == 1 else None
        ),
        "actual_merkle_root": aggregate_root,
        "merkle_root": aggregate_root,
        "total_chunks": total_chunks,
        "verified_chunk_count": verified_chunks,
        "corrupted_chunk_count": corrupted_chunks,
        "verified_chunks": verified_indices,
        "corrupted_chunks": corrupted_indices,
        "files": files,
        "failure_reason": None if verified else "One or more stored chunks failed hash verification",
    }
