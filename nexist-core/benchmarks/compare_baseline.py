"""Exploratory managed-model versus simple-record timing comparison."""
from __future__ import annotations

import argparse
import statistics
import time
from dataclasses import dataclass

from nexist import NexistEngine, Requirement


@dataclass
class BaselineUnit:
    label: str
    state: str = "potential"


def run_nexist(count: int) -> None:
    engine = NexistEngine()
    ids = [
        engine.create(
            f"unit-{index}",
            "benchmark",
            requirements=[Requirement("available", "gte", 1)],
            actor="benchmark",
        ).id
        for index in range(count)
    ]
    for unit_id in ids:
        engine.evaluate(unit_id, {"available": 1}, actor="benchmark")


def run_baseline(count: int) -> None:
    units = [BaselineUnit(f"unit-{index}") for index in range(count)]
    facts = {"available": 1}
    for unit in units:
        unit.state = "eligible" if facts.get("available", 0) >= 1 else "potential"


def measure(function, count: int, rounds: int) -> list[float]:
    samples: list[float] = []
    for _ in range(rounds):
        started = time.perf_counter()
        function(count)
        samples.append(time.perf_counter() - started)
    return samples


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--units", type=int, default=1000)
    parser.add_argument("--rounds", type=int, default=7)
    args = parser.parse_args()
    if args.units < 1 or args.rounds < 1:
        parser.error("--units and --rounds must both be positive")

    nexist = measure(run_nexist, args.units, args.rounds)
    baseline = measure(run_baseline, args.units, args.rounds)
    print(f"Units per round: {args.units}")
    print(f"Rounds: {args.rounds}")
    print(f"NEXIST median: {statistics.median(nexist):.6f}s | samples={nexist}")
    print(f"Baseline median: {statistics.median(baseline):.6f}s | samples={baseline}")
    print("Interpretation: exploratory only; the implementations perform different work.")


if __name__ == "__main__":
    main()
