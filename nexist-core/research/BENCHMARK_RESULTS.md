# NEXIST Comparative Benchmark Results — Initial CI Run

**Run date:** 18 November 2026  
**Source commit:** `9bd8b0bbd53dcd3be63148e82972f7862f12f219`  
**GitHub Actions run:** [44342126387](https://github.com/lakindusathsara44-bit/Apokolips/actions/runs/44342126387)  
**Benchmark:** `nexist-equivalent-workload-v0.1`  
**Python:** 3.15.2  
**Runner platform:** Linux 7.0.0-1016-aws, x86_64  
**Repetitions:** 3 per size

## Results

| Initial units | Final units (after composition) | NEXIST median | Reference median | NEXIST / baseline | NEXIST peak traced memory | Reference peak traced memory |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 105 | 15.933 ms | 9.988 ms | 1.595× | 1,080,729 bytes | 1,109,182 bytes |
| 1,000 | 1,050 | 158.098 ms | 94.829 ms | 1.667× | 10,820,278 bytes | 11,137,838 bytes |

The benchmark's semantic fingerprint matched for both implementations at both sizes. The workloads also matched on unit-state counts, relationships, parents, requirement count, and event count.

### 100-unit run

- NEXIST median: 15.933 ms (samples: 16.565, 15.912, 15.933 ms)
- Reference median: 9.988 ms (samples: 10.111, 9.655, 9.988 ms)
- NEXIST was approximately 59.5% slower in this run.
- Peak traced memory was approximately 2.6% lower for NEXIST.

The final snapshot contained 105 units: 85 eligible, 10 realised, and 10 archived; 50 relations, 10 parent references, 115 requirements, and 285 events.

### 1,000-unit run

- NEXIST median: 158.098 ms (samples: 158.098, 161.353, 154.464 ms)
- Reference median: 94.829 ms (samples: 94.829, 94.741, 100.301 ms)
- NEXIST was approximately 66.7% slower in this run.
- Peak traced memory was approximately 2.9% lower for NEXIST.

The final snapshot contained 1,050 units: 850 eligible, 100 realised, and 100 archived; 500 relations, 100 parent references, 1,150 requirements, and 2,850 events.

## Interpretation

This initial measurement does **not** show a speed advantage for NEXIST. For the tested valid-input workload, the conventional reference implementation completed faster. NEXIST's defensive JSON validation, detached snapshots, and engine-level invariant checks are plausible sources of some of the additional cost, but profiling is required before attributing the difference to any particular operation.

The small peak-memory differences are not meaningful evidence of a memory advantage. They are single-run `tracemalloc` peaks, not full process resident-memory measurements.

These data are not a statistically strong performance study: only three repetitions were run on one hosted runner and one Python build. The baseline also reproduces the successful workload semantics, not every defensive rejection path supported by NEXIST. Do not generalise these timings to Windows, Kali Linux, other Python versions, or production workloads.

## What this result tells us

1. The two implementations produced the same normalised semantic result for the tested scenarios. This is useful conformance evidence for the benchmark fixture.
2. NEXIST currently carries measurable overhead for the chosen workload.
3. The result does not establish that NEXIST is novel, faster, or generally better than conventional structures.
4. A next performance study should profile create, evaluate, link, compose, snapshot, and persistence separately; use more repetitions; report CPU and memory details; and compare on more than one machine.
5. A separate developer study is still needed to test whether the NEXIST API improves modelling clarity or auditability.

**Research conclusion:** retain NEXIST as an experimental model/API. Do not make a "new fundamental data structure" or performance-superiority claim on the basis of this initial benchmark.
