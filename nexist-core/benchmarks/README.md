# NEXIST benchmark notes

The benchmark runner is exploratory, not a performance claim. It compares the managed NEXIST workflow (UUID creation, defensive JSON validation, lifecycle events, managed snapshots) with a deliberately small Python dataclass baseline (plain records and a hand-written prerequisite check).

These are not feature-identical implementations: the NEXIST path performs more validation and trace recording. A slower NEXIST result is therefore not evidence of a poor model, and a faster result would not prove novelty. The runner exists to expose overhead and encourage reproducible measurement, not to produce a headline score.

Run from `nexist-core`:

```bash
python -m benchmarks.compare_baseline --units 1000 --rounds 7
```

For a serious study, add equivalent workloads and tests for relationship graphs, composition, persistence, invalid transitions, memory use, and human traceability. Record Python version, OS, hardware, warm-up policy, all raw samples, and the exact commit. Run on an otherwise idle machine. Do not compare results from different machines or interpreters as if they were controlled experiments.
