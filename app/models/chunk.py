from pydantic import BaseModel, Field


class Chunk(BaseModel):
    """
    Base chunk model for file chunking operations.
    """
    chunk_id: str
    offset: int = Field(ge=0)
    size: int = Field(gt=0)


class FixedSizeChunk(Chunk):
    """
    Chunk model for fixed-size chunking.
    """
    chunk_number: int = Field(ge=1)
    data: bytes | None = None  # Optional, may not be included in responses


class ContentDefinedChunk(Chunk):
    """
    Chunk model for content-defined chunking.
    """
    hash: str  # SHA-256 hash of chunk data


class ChunkResponse(BaseModel):
    """
    API response model for chunk creation.
    """
    file_path: str
    method: str  # "fixed" or "content_defined"
    total_chunks: int = Field(ge=0)
    chunks: list[Chunk | FixedSizeChunk | ContentDefinedChunk]