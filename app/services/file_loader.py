import base64
from pathlib import Path

from app.store import file_bytes


def resolve_file_bytes(
    file_id: str | None,
    file_path: str | None,
    content_base64: str | None,
) -> bytes:
    if content_base64:
        try:
            data = base64.b64decode(content_base64, validate=True)
        except Exception as exc:
            raise ValueError("content_base64 is not valid Base64") from exc
        if file_id:
            file_bytes[file_id] = data
        return data

    if file_path:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        data = path.read_bytes()
        if file_id:
            file_bytes[file_id] = data
        return data

    if file_id and file_id in file_bytes:
        return file_bytes[file_id]

    raise ValueError(
        "Provide file_path, content_base64, or a previously stored file_id"
    )
