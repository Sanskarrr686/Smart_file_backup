def calculate_delta_size(unique_chunk_sizes: list[int]) -> int:
    """
    Calculate the amount of new data that needs to be stored.

    Only unique chunks contribute to delta size.
    """
    return sum(unique_chunk_sizes)


def calculate_savings_ratio(
    original_size: int,
    delta_size: int,
) -> float:
    """
    Calculate storage savings ratio.

    Formula:
        (original_size - delta_size) / original_size

    Returns 0.0 for an empty file.
    """

    if original_size < 0:
        raise ValueError("original_size cannot be negative")

    if delta_size < 0:
        raise ValueError("delta_size cannot be negative")

    if original_size == 0:
        return 0.0

    if delta_size > original_size:
        raise ValueError(
            "delta_size cannot be greater than original_size"
        )

    return (original_size - delta_size) / original_size