from app.chunking.bytes_io import fixed_size_chunks_from_bytes
from app.chunking.rabin_karp import rabin_karp_chunks


def normalize_boundaries(value: str | None, method: str | None = None) -> str:
    raw = (value or method or "fixed").lower().replace("_", "-")
    if raw in {"content-defined", "cdc", "rabin-karp", "rabin"}:
        return "content-defined"
    if raw in {"fixed", "fixed-size"}:
        return "fixed"
    if raw == "auto":
        return "auto"
    raise ValueError("chunk_boundaries must be fixed, content-defined, or auto")


def select_boundaries(requested: str, optimization_metric: str) -> str:
    if requested != "auto":
        return requested
    if optimization_metric == "maximize_compression":
        return "content-defined"
    return "fixed"


def chunk_bytes(
    data: bytes,
    boundaries: str,
    chunk_size: int,
    hash_algorithm: str,
    file_id: str,
) -> list[dict]:
    if boundaries == "fixed":
        return fixed_size_chunks_from_bytes(
            data,
            chunk_size=chunk_size,
            hash_algorithm=hash_algorithm,
            file_id=file_id,
        )
    return rabin_karp_chunks(
        data,
        min_size=max(1, chunk_size // 2),
        avg_size=chunk_size,
        max_size=chunk_size * 2,
        hash_algorithm=hash_algorithm,
        file_id=file_id,
    )
