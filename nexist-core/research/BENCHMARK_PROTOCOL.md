# NEXIST Comparative Evaluation Protocol

**Protocol version:** 0.1  
**Date:** 18 November 2026  
**Purpose:** Compare NEXIST with a conventional Python implementation that offers the same tested features.

## Research question

For a workload that creates potential entities, evaluates their prerequisites, connects them, composes parent units, records transitions, and persists the result, does the NEXIST API provide a measurable difference in correctness, development clarity, runtime, or memory compared with an ordinary Python implementation using data classes, dictionaries, and explicit helper functions?

## Baselines

- **NEXIST:** the v0.2 reference engine.
- **Conventional reference:** a separate implementation in `benchmarks/reference_baseline.py` using Python data classes and dictionaries.

The reference implementation intentionally reproduces the same valid-input workload semantics: IDs, labels/kinds, descriptive attributes, requirements, directed relations, composition parents, lifecycle state, event history, evaluation, explicit realisation, archive, and JSON save/load. The benchmark compares equivalent successful scenarios, not malicious or malformed-input handling. NEXIST has additional defensive validation, and that overhead is part of the measured implementation cost.

The comparison is not against a deliberately feature-poor dictionary-only toy. Both implementations must produce the same normalised summary after the same workload. A mismatch stops the benchmark.

## Workload

For each requested size:
1. Create N units with identical attributes and one numeric requirement.
2. Add the same set of directed relationships.
3. Evaluate every unit against the same facts snapshot.
4. Compose parent pairs and apply an additional requirement.
5. Evaluate composites and explicitly realise a deterministic subset.
6. Archive a deterministic subset.
7. Save to JSON, reload, and compute a normalised summary.
8. Compare summaries before recording timing results.

The benchmark measures the end-to-end workload, including validation, lifecycle events, snapshots, composition, and atomic persistence. It does not isolate each operation and does not measure developer time or usability.

## Metrics

- median elapsed wall time across repetitions;
- minimum and maximum sample time;
- peak traced Python memory for one workload run;
- semantic parity summary (unit/state/relation/parent/requirement/event counts).

Results must be reported with Python version, operating system, machine/runner details, workload size, number of repetitions, and exact Git commit. CI timings are indicative only and should not be treated as portable performance claims.

## Valid interpretation

- If summaries differ, the comparison fails and timing results are invalid.
- If NEXIST is slower, that may reflect additional safety checks, detached snapshots, and event recording; inspect the workload and profiles before drawing conclusions.
- If NEXIST is faster, that does not establish novelty or general superiority; repeat on other systems and compare against mature libraries.
- Runtime measurements do not test the research hypothesis about modelling clarity or auditability. Those need a separate developer/user study with a defined protocol.

## Reproducibility

Run from `nexist-core`:

```bash
python -m benchmarks.equivalent_workload --sizes 100,1000 --rounds 5
```

Use the same Python build, hardware, OS power profile, and idle-machine conditions for every run. Preserve the full output. Do not compare runs across different machines as if they were controlled.

## Research integrity

This protocol is an initial engineering experiment, not a peer-reviewed benchmark. It cannot establish that NEXIST is the first of its kind or a fundamentally new data structure. The related-work review explicitly documents relevant existing approaches and known overlap.
