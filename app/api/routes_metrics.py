import gc
import statistics
import time
import tracemalloc

from fastapi import APIRouter, HTTPException

from app.index.hashmap_index import HashMapIndex
from app.index.avl_tree import AVLTree
from app.index.rb_tree import RBTree
from app.api.routes_dedup import index as dedup_index
from app.api.contracts import success_envelope
from app.services.minio_store import MinioConfigurationError, MinioStore


router = APIRouter(
    prefix="/api/v1/metrics",
    tags=["Metrics"],
)


def build_hashmap(size: int):
    index = HashMapIndex()

    for i in range(size):
        index.insert(
            f"hash_{i}",
            f"chunk_{i}",
        )

    return index


def build_avl(size: int):
    tree = AVLTree()

    for i in range(size):
        tree.insert(
            f"hash_{i}",
            f"chunk_{i}",
        )

    return tree


def build_rb_tree(size: int):
    tree = RBTree()

    for i in range(size):
        tree.insert(
            f"hash_{i}",
            f"chunk_{i}",
        )

    return tree


def measure_lookup(index, size: int, lookup_count: int = 1000):
    timings_us = []

    # Warm-up
    for i in range(min(100, size)):
        index.lookup(f"hash_{i}")

    # Measure lookup time
    for i in range(lookup_count):
        key = f"hash_{i % size}"

        start = time.perf_counter_ns()

        result = index.lookup(key)

        elapsed_ns = time.perf_counter_ns() - start

        if result is None:
            raise RuntimeError(
                f"Lookup failed for key: {key}"
            )

        timings_us.append(
            elapsed_ns / 1000
        )

    average_us = statistics.mean(timings_us)

    sorted_timings = sorted(timings_us)

    p95_position = int(
        0.95 * len(sorted_timings)
    ) - 1

    p95_us = sorted_timings[
        max(0, p95_position)
    ]

    return average_us, p95_us


def measure_memory(builder, size: int):
    gc.collect()

    tracemalloc.start()

    before = tracemalloc.take_snapshot()

    index = builder(size)

    after = tracemalloc.take_snapshot()

    stats = after.compare_to(
        before,
        "lineno",
    )

    allocated_bytes = sum(
        max(0, stat.size_diff)
        for stat in stats
    )

    tracemalloc.stop()

    return index, allocated_bytes / 1024


@router.get("/benchmark")
@router.get("/dedup")
def benchmark_indexes(size: int = 1000):

    if size <= 0:
        raise HTTPException(
            status_code=400,
            detail="size must be greater than 0",
        )

    implementations = [
        ("HashMap", build_hashmap),
        ("AVL", build_avl),
        ("RedBlack", build_rb_tree),
    ]

    results = []

    for name, builder in implementations:

        index, memory_kib = measure_memory(
            builder,
            size,
        )

        average_us, p95_us = measure_lookup(
            index,
            size,
        )

        results.append(
            {
                "index": name,
                "average_lookup_us": round(
                    average_us,
                    3,
                ),
                "p95_lookup_us": round(
                    p95_us,
                    3,
                ),
                "memory_kib": round(
                    memory_kib,
                    2,
                ),
            }
        )

    response = {
        "dataset_size": size,
        "results": results,
        "cache": dedup_index.get_stats(),
        "operational_stats": None,
        "complexity": {
            "HashMap": {"time": "O(1) average", "space": "O(n)"},
            "AVL": {"time": "O(log n)", "space": "O(n)"},
            "RedBlack": {"time": "O(log n)", "space": "O(n)"},
        },
    }
    try:
        store = MinioStore.optional_from_env()
    except MinioConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if store is not None:
        response["operational_stats"] = store.get_dedup_statistics()
    return success_envelope(response)