"""Feature-parity workload benchmark for NEXIST versus a conventional Python model."""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import tempfile
import time
import tracemalloc
from pathlib import Path
from typing import Any, Callable

from benchmarks.reference_baseline import (
    NexistAdapter,
    ReferenceBaseline,
    make_requirement,
)


def workload(engine, size: int, save_path: Path) -> dict[str, Any]:
    ids: list[str] = []
    base_requirement = [make_requirement("resources", "gte", 10)]
    for index in range(size):
        unit = engine.create(
            label=f"Proposed unit {index}",
            kind="facility" if index % 2 == 0 else "service",
            attributes={"index": index, "area": "north"},
            requirements=base_requirement,
            actor="benchmark",
        )
        ids.append(unit.id)

    for index in range(0, size - 1, 2):
        engine.link(ids[index], ids[index + 1], "depends_on", actor="benchmark")

    facts = {"resources": 12, "site": {"region": "north"}}
    for unit_id in ids:
        engine.evaluate(unit_id, facts, actor="benchmark")

    composite_ids: list[str] = []
    composite_requirement = [make_requirement("site.region", "eq", "north")]
    for index in range(0, size - 1, 20):
        composite = engine.compose(
            [ids[index], ids[index + 1]],
            label=f"Composite proposal {index // 20}",
            kind="composite",
            requirements=composite_requirement,
            actor="benchmark",
        )
        composite_ids.append(composite.id)

    for unit_id in composite_ids:
        engine.evaluate(unit_id, facts, actor="benchmark")

    for unit_id in ids[: max(1, size // 10)]:
        engine.realize(unit_id, actor="benchmark")
    for unit_id in ids[-max(1, size // 10):]:
        state = engine.get(unit_id).state
        if state_name(state) == "eligible":
            engine.archive(unit_id, actor="benchmark")

    engine.save(save_path)
    loaded = type(engine).load(save_path) if isinstance(engine, ReferenceBaseline) else NexistAdapter.load(save_path)
    return summarise(loaded)


def state_name(state: Any) -> str:
    return state.value if hasattr(state, "value") else str(state)


def _field(value: Any, name: str) -> Any:
    return getattr(value, name) if hasattr(value, name) else value[name]


def _normalise_references(value: Any, id_to_label: dict[str, str], key: str | None = None) -> Any:
    if key == "target_id":
        return {"target_label": id_to_label.get(value, "<missing>")}
    if key == "parent_ids":
        return [id_to_label.get(item, "<missing>") for item in value]
    if isinstance(value, dict):
        return {
            child_key: _normalise_references(child, id_to_label, child_key)
            for child_key, child in sorted(value.items())
        }
    if isinstance(value, list):
        return [_normalise_references(child, id_to_label) for child in value]
    return value


def semantic_fingerprint(units: list[Any]) -> str:
    """Hash stable semantic data, ignoring random IDs and event timestamps."""
    id_to_label = {unit.id: unit.label for unit in units}
    normalised = []
    for unit in units:
        relations = [
            {
                "target_label": id_to_label.get(_field(relation, "target_id"), "<missing>"),
                "relation": _field(relation, "relation"),
            }
            for relation in unit.relations
        ]
        requirements = [
            {
                "path": _field(requirement, "path"),
                "operator": _field(requirement, "operator"),
                "expected": _field(requirement, "expected"),
            }
            for requirement in unit.requirements
        ]
        events = []
        for event in unit.events:
            events.append({
                "type": _field(event, "event_type"),
                "actor": _field(event, "actor"),
                "details": _normalise_references(_field(event, "details"), id_to_label),
            })
        normalised.append({
            "label": unit.label,
            "kind": unit.kind,
            "state": state_name(unit.state),
            "attributes": unit.attributes,
            "requirements": requirements,
            "relations": sorted(relations, key=lambda item: (item["relation"], item["target_label"])),
            "parent_labels": [id_to_label.get(item, "<missing>") for item in unit.parent_ids],
            "events": events,
        })
    normalised.sort(key=lambda item: item["label"])
    encoded = json.dumps(normalised, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def summarise(engine) -> dict[str, Any]:
    units = engine.list_units()
    event_counts: dict[str, int] = {}
    state_counts: dict[str, int] = {}
    for unit in units:
        state = state_name(unit.state)
        state_counts[state] = state_counts.get(state, 0) + 1
        for event in unit.events:
            name = _field(event, "event_type")
            event_counts[name] = event_counts.get(name, 0) + 1
    return {
        "units": len(units),
        "states": dict(sorted(state_counts.items())),
        "relations": sum(len(unit.relations) for unit in units),
        "parents": sum(len(unit.parent_ids) for unit in units),
        "requirements": sum(len(unit.requirements) for unit in units),
        "events": sum(len(unit.events) for unit in units),
        "event_types": dict(sorted(event_counts.items())),
        "semantic_sha256": semantic_fingerprint(units),
    }


def run_once(factory: Callable[[], Any], size: int) -> tuple[float, int, dict[str, Any]]:
    with tempfile.TemporaryDirectory() as directory:
        save_path = Path(directory) / "snapshot.json"
        engine = factory()
        started = time.perf_counter()
        summary = workload(engine, size, save_path)
        elapsed = time.perf_counter() - started
        return elapsed, 0, summary


def measure(factory: Callable[[], Any], size: int, rounds: int) -> dict[str, Any]:
    samples: list[float] = []
    expected_summary = None
    for _ in range(rounds):
        elapsed, _, summary = run_once(factory, size)
        if expected_summary is None:
            expected_summary = summary
        elif summary != expected_summary:
            raise AssertionError("A model produced inconsistent summaries across repetitions.")

        samples.append(elapsed)

    with tempfile.TemporaryDirectory() as directory:
        tracemalloc.start()
        engine = factory()
        workload(engine, size, Path(directory) / "memory.json")
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

    return {
        "median_seconds": round(statistics.median(samples), 6),
        "min_seconds": round(min(samples), 6),
        "max_seconds": round(max(samples), 6),
        "peak_traced_bytes": peak,
        "samples_seconds": [round(value, 6) for value in samples],
        "summary": expected_summary,
    }


def compare(size: int, rounds: int) -> dict[str, Any]:
    # Warm both paths before timing to reduce one-time import/start-up noise.
    run_once(NexistAdapter, min(size, 10))
    run_once(ReferenceBaseline, min(size, 10))

    nexist = measure(NexistAdapter, size, rounds)
    baseline = measure(ReferenceBaseline, size, rounds)
    if nexist["summary"] != baseline["summary"]:
        raise AssertionError(
            "Semantic parity failed: NEXIST and reference baseline summaries differ. "
            f"NEXIST={nexist['summary']} BASELINE={baseline['summary']}"
        )
    return {
        "size": size,
        "rounds": rounds,
        "semantic_parity": True,
        "nexist": nexist,
        "reference_baseline": baseline,
        "time_ratio_nexist_over_baseline": round(
            nexist["median_seconds"] / baseline["median_seconds"], 3
        ) if baseline["median_seconds"] else None,
        "peak_memory_ratio_nexist_over_baseline": round(
            nexist["peak_traced_bytes"] / baseline["peak_traced_bytes"], 3
        ) if baseline["peak_traced_bytes"] else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sizes", default="100,1000", help="Comma-separated positive unit counts.")
    parser.add_argument("--rounds", type=int, default=5)
    args = parser.parse_args()
    try:
        sizes = [int(value.strip()) for value in args.sizes.split(",")]
    except ValueError:
        parser.error("--sizes must be a comma-separated list of integers")
    if not sizes or any(size < 2 for size in sizes) or args.rounds < 1:
        parser.error("Each size must be at least 2 and rounds must be positive.")

    report = {
        "benchmark": "nexist-equivalent-workload-v0.1",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "rounds": args.rounds,
        "protocol": "nexist-core/research/BENCHMARK_PROTOCOL.md",
        "results": [compare(size, args.rounds) for size in sizes],
        "interpretation": (
            "Exploratory only. Feature-parity summary is checked, but this is not "
            "a systematic performance study or proof of novelty."
        ),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
