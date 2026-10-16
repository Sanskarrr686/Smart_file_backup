"""
Benchmark Team B hash-index implementations.

Compares:
    1. HashMapIndex
    2. AVLTree
    3. RBTree

Measures:
    - Average lookup time
    - P95 lookup time
    - Memory usage
"""

import gc
import json
import os
import statistics
import sys
import time
import tracemalloc
from pathlib import Path

# Ensure project root is in sys.path when executed directly
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.hashing.hasher import Hasher
from app.index.hashmap_index import HashMapIndex
from app.index.avl_tree import AVLTree
from app.index.rb_tree import RBTree


DATASET_SIZES = [1000, 5000, 10000]
LOOKUPS_PER_SIZE = 1000


def build_hashmap(size: int) -> HashMapIndex:
    index = HashMapIndex()
    for i in range(size):
        index.insert(f"hash_{i}", f"chunk_{i}")
    return index


def build_avl(size: int) -> AVLTree:
    tree = AVLTree()
    for i in range(size):
        tree.insert(f"hash_{i}", f"chunk_{i}")
    return tree


def build_rb_tree(size: int) -> RBTree:
    tree = RBTree()
    for i in range(size):
        tree.insert(f"hash_{i}", f"chunk_{i}")
    return tree


def measure_lookup(index, size: int, lookup_count: int = LOOKUPS_PER_SIZE):
    """
    Measure repeated lookup latency.

    Returns:
        average lookup time in microseconds
        p95 lookup time in microseconds
    """
    # Warm-up
    for i in range(min(100, size)):
        index.lookup(f"hash_{i}")

    timings_us = []
    for i in range(lookup_count):
        key = f"hash_{i % size}"
        start = time.perf_counter_ns()
        result = index.lookup(key)
        elapsed_ns = time.perf_counter_ns() - start

        if result is None:
            raise RuntimeError(f"Lookup failed for key: {key}")

        timings_us.append(elapsed_ns / 1000)

    average_us = statistics.mean(timings_us)
    sorted_timings = sorted(timings_us)
    p95_position = int(0.95 * len(sorted_timings)) - 1
    p95_us = sorted_timings[max(0, p95_position)]

    return average_us, p95_us


def measure_memory(builder, size: int):
    """
    Measure memory allocated while building an index.

    Returns memory allocated in KiB.
    """
    gc.collect()
    tracemalloc.start()

    snapshot_before = tracemalloc.take_snapshot()
    index = builder(size)
    snapshot_after = tracemalloc.take_snapshot()

    stats = snapshot_after.compare_to(snapshot_before, "lineno")
    allocated_bytes = sum(max(0, stat.size_diff) for stat in stats)

    tracemalloc.stop()
    return index, allocated_bytes / 1024


def measure_10mb_computation_latency() -> dict:
    """
    Measures the Team B KPI target:
    Computation latency p95 <= 100 ms per 10 MB file on reference machine.
    """
    chunk_size = 4096
    total_bytes = 10 * 1024 * 1024  # 10 MB
    num_chunks = total_bytes // chunk_size
    hasher = Hasher("sha256")
    synthetic_chunk = b"A" * chunk_size

    latencies_ms = []
    for _ in range(20):  # 20 trials for p95 computation
        start = time.perf_counter()
        for _ in range(num_chunks):
            hasher.hash(synthetic_chunk)
        elapsed_ms = (time.perf_counter() - start) * 1000
        latencies_ms.append(elapsed_ms)

    sorted_latencies = sorted(latencies_ms)
    p95_idx = int(0.95 * len(sorted_latencies)) - 1
    p95_ms = sorted_latencies[max(0, p95_idx)]
    avg_ms = statistics.mean(latencies_ms)

    return {
        "file_size_mb": 10,
        "chunk_count": num_chunks,
        "chunk_size_bytes": chunk_size,
        "average_latency_ms": round(avg_ms, 2),
        "p95_latency_ms": round(p95_ms, 2),
        "kpi_target_ms": 100.0,
        "kpi_passed": p95_ms <= 100.0,
    }


def benchmark():
    implementations = [
        ("HashMap", build_hashmap),
        ("AVL", build_avl),
        ("RedBlack", build_rb_tree),
    ]

    print("=" * 80)
    print("TEAM B HASH INDEX BENCHMARK")
    print("=" * 80)

    benchmark_data = {
        "benchmark_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "index_benchmarks": {},
        "large_file_computation": {},
    }

    for size in DATASET_SIZES:
        print(f"\nDataset size: {size:,}")
        print("-" * 80)
        print(
            f"{'Index':<12}"
            f"{'Avg (us)':>15}"
            f"{'P95 (us)':>15}"
            f"{'Memory (KiB)':>18}"
        )

        benchmark_data["index_benchmarks"][str(size)] = []

        for name, builder in implementations:
            index, memory_kib = measure_memory(builder, size)
            average_us, p95_us = measure_lookup(index, size)

            print(
                f"{name:<12}"
                f"{average_us:>15.3f}"
                f"{p95_us:>15.3f}"
                f"{memory_kib:>18.2f}"
            )

            benchmark_data["index_benchmarks"][str(size)].append({
                "index": name,
                "average_lookup_us": round(average_us, 3),
                "p95_lookup_us": round(p95_us, 3),
                "memory_kib": round(memory_kib, 2),
                "kpi_p95_target_us": 1000.0,  # 1 ms
                "kpi_passed": p95_us <= 1000.0,
            })

    print("\nRunning 10 MB Computation Latency Benchmark...")
    comp_results = measure_10mb_computation_latency()
    benchmark_data["large_file_computation"] = comp_results
    print(f"10 MB Chunking + SHA-256 Latency: Avg = {comp_results['average_latency_ms']} ms, P95 = {comp_results['p95_latency_ms']} ms (Target: <= 100 ms) -> {'PASS' if comp_results['kpi_passed'] else 'FAIL'}")

    results_file = Path(__file__).resolve().parent / "perf_results.json"
    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(benchmark_data, f, indent=2)

    print(f"\nRaw results exported to: {results_file}")
    print("Benchmark complete.")


if __name__ == "__main__":
    benchmark()