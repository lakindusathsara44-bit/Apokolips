# NEXIST Comparative Benchmark Results — Initial Replications

**Benchmark:** `nexist-equivalent-workload-v0.1`  
**Python:** 3.15.2  
**Workload sizes:** 100 and 1,000 initial units  
**Repetitions:** 3 per implementation and size  
**Validation:** Both runs reported matching semantic fingerprints for NEXIST and the conventional reference implementation at both sizes.

## Run A

- GitHub Actions run: [44342126387](https://github.com/lakindusathsara44-bit/Apokolips/actions/runs/44342126387)
- Source commit: `9bd8b0bbd53dcd3be63148e82972f7862f12f219`
- Runner: Linux 7.0.0-1016-aws, x86_64
- Workload semantic parity: true for both sizes

| Initial units | Final units | NEXIST median | Reference median | Time ratio | NEXIST peak traced memory | Reference peak traced memory |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 105 | 15.933 ms | 9.988 ms | 1.595× | 1,080,729 B | 1,109,182 B |
| 1,000 | 1,050 | 158.098 ms | 94.829 ms | 1.667× | 10,820,278 B | 11,137,838 B |

## Run B — documentation/website replication

- GitHub Actions run: [44342393531](https://github.com/lakindusathsara44-bit/Apokolips/actions/runs/44342393531)
- Source commit: `ac5c26a153fe11aff111dd907cdf061e61b7fe96`
- Runner: Linux 7.0.0-1019-azure, x86_64
- Workload semantic parity: true for both sizes

| Initial units | Final units | NEXIST median | Reference median | Time ratio | NEXIST peak traced memory | Reference peak traced memory |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 105 | 26.945 ms | 15.305 ms | 1.761× | 1,079,329 B | 1,109,132 B |
| 1,000 | 1,050 | 258.048 ms | 155.668 ms | 1.658× | 10,820,428 B | 11,129,438 B |

## Workload contents and semantic parity

Both implementations ran the same valid-input scenario:
- create units with attributes and declared requirements;
- link unit pairs;
- evaluate the requirements against the same facts snapshot;
- compose parent pairs and inherit requirements;
- evaluate composites;
- explicitly realise a deterministic subset;
- archive another subset;
- save to JSON, reload, and compare normalised semantic fingerprints.

For 100 initial units, the final persisted dataset contained 105 units, 50 relations, 10 parent references, 115 requirements, and 285 events. For 1,000 initial units, it contained 1,050 units, 500 relations, 100 parent references, 1,150 requirements, and 2,850 events.

The matching hashes show that the tested end states, attributes, requirements, relationships, parent lineage, event types, event actors, and event details were equivalent after normalising random IDs and ignoring timestamps.

## Interpretation

**NEXIST did not show a speed advantage in these tests.** Across the four within-run comparisons, its median end-to-end runtime was approximately 59.5% to 76.1% higher than the conventional reference implementation. The NEXIST implementation also had a roughly 2.6% to 2.9% lower peak `tracemalloc` reading in these runs; this small difference is not evidence of a memory advantage.

The NEXIST engine performs defensive JSON checks, detached snapshots, and engine-level validation. The reference baseline implements the same successful scenario semantics but is not a duplicate of every NEXIST input-rejection safeguard. Some measured runtime difference may therefore be the cost of those additional protections; profiling is required to identify the actual contributors.

Run A and Run B used different hosted runner platforms. Compare NEXIST with its baseline **within each run** only; do not compare absolute times across the two runners. Each run used only three repetitions on one hosted environment. These results are indicative engineering measurements, not a statistically strong performance study.

## Next experiment

1. Profile `create`, `evaluate`, `link`, `compose`, detached snapshots, and persistence separately.
2. Add controlled ablation runs to identify the cost of deep-copy snapshots and JSON validation.
3. Repeat with more rounds and multiple local machines/interpreters, recording CPU model, OS, Python build, and system load.
4. Run a separate developer study to test whether the API improves modelling clarity or auditability.

**Research conclusion:** continue NEXIST as an experimental model/API. The current measurements do not support claims that it is faster or a new fundamental data structure.
