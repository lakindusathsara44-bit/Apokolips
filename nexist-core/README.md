# NEXIST — Python Core Engine v0.2

NEXIST is an experimental data-model prototype for representing **potential digital entities** as NX Units. This folder contains the Python reference engine for the current experimental model (package version 0.2.0).

> Research status: prototype only. The design is not claimed to be unprecedented or to be a new fundamental computing primitive. Its novelty and practical advantage require comparison with established data models, graph structures, and constraint systems.

## Requirements

- Python 3.10 or newer
- No third-party dependencies

## Run the tests

From this directory:

```bash
python -m unittest discover -s tests -t . -v
```

## Quick example

```python
from nexist import NexistEngine, Requirement

engine = NexistEngine()
unit = engine.create(
    label="Future Research Lab",
    kind="facility",
    requirements=[Requirement("resources", "gte", 10)],
)

result = engine.evaluate(unit.id, facts={"resources": 12})
print(result.state.value)  # eligible

engine.realize(unit.id, actor="researcher")
print(engine.get(unit.id).state.value)  # realized
```

## Lifecycle

- `POTENTIAL`: represented, but requirements have not been confirmed.
- `ELIGIBLE`: all declared requirements pass against the supplied facts.
- `REALIZED`: an explicit operation records the transition.
- `ARCHIVED`: inactive, with its record retained.

Evaluation does not automatically realise a unit. The `realize()` operation requires an eligible unit and a non-empty actor.

## Main operations

- `create()`, `get()`
- `link()`, `compose()`
- `evaluate()`, `realize()`, `archive()`
- `save()`, `load()`

Requirements are declarative and support `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `exists`, `in`, and `contains`. No requirement expression is executed as Python code.

## Scope notes

- Evaluation uses an explicit facts mapping; unit attributes are descriptive and are not silently treated as evaluation facts.
- `REALIZED` means realised inside the NEXIST model. It does not assert that a physical object or external process has been created.
- Composition currently carries parent lineage and inherited requirements. It does not yet implement emergent semantics.
- A useful next research step is a reproducible comparison against ordinary Python dataclasses plus graph and constraint utilities.

## Formal specification and research status

Read [SPECIFICATION.md](SPECIFICATION.md) for the lifecycle rules, requirement semantics, invariants, persistence boundary, research hypotheses, and evaluation plan. The specification is a draft; NEXIST is an experimental model, not a proven novel computing primitive.

## Test suite

Run from this directory:

```bash
python -m unittest discover -s tests -t . -v
```

The `tests/__init__.py` file makes the test directory importable for this explicit `unittest` discovery command, including in GitHub Actions.


## v0.2 integrity guarantees

- Public methods return detached snapshots. Editing a returned object does not silently mutate engine records.
- Attributes, requirement values, and facts are checked for JSON compatibility, including finite numbers and string object keys.
- Requirement comparisons distinguish booleans from numbers while treating JSON integers and floating-point numbers as the same number domain.
- JSON saves are written to a temporary file and atomically replaced; loading validates record shape and graph references.
- The loader accepts the earlier `nexist-0.1` file format and writes subsequent saves as `nexist-0.2`.
- Composition lineage is checked for missing references and cycles when loading persisted data.

The engine is still an in-memory, single-process prototype. It is not thread-safe and does not provide database transactions or distributed consistency.

## Runnable example

From the `nexist-core` directory:

```bash
python -m examples.quickstart
```

## Exploratory baseline timing

From the same directory:

```bash
python -m benchmarks.compare_baseline --units 1000 --rounds 7
```

This runner is deliberately labelled exploratory. It compares a feature-rich managed engine path with a tiny dataclass baseline, so the timings are not a fair feature-for-feature performance contest and must not be used as evidence of novelty. See [benchmarks/README.md](benchmarks/README.md) before interpreting results.

## Comparative research

The initial research notes are in [research/README.md](research/README.md). They identify overlap with RDF, OWL, constraint modelling, UML state machines, event sourcing, and digital twins. The comparison does not support a "world-first" or "new fundamental data structure" claim at this stage.

Run a feature-parity comparison against an independent conventional Python implementation:

```bash
python -m benchmarks.equivalent_workload --sizes 100,1000 --rounds 5
```

The runner compares normalised semantic summaries before accepting timings. Read [BENCHMARK_PROTOCOL.md](research/BENCHMARK_PROTOCOL.md) before interpreting results and [BENCHMARK_RESULTS.md](research/BENCHMARK_RESULTS.md) for the first successful CI measurements. The initial CI run found no speed advantage for NEXIST; this is exploratory evidence, not a proof of novelty or general performance superiority.


## Evidence-aware lifecycle extension (experimental v0.3)

The separate EvidenceAwareEngine prototype extends the model with explicit evidence records, per-requirement evaluation results, dependency invalidation, review flags, and one-use approval before realization. It does not change the original NexistEngine facts-based API.

Run the example from this directory with: python -m examples.evidence_lifecycle

Run all tests with: python -m unittest discover -s tests -t . -v

Key behaviours:
- Evidence records carry a fact path, value, source label, actor, observation time, optional expiry, and revocation details.
- Checks return PASS, FAIL, UNKNOWN, or CONFLICT. Missing or conflicting evidence cannot count as success.
- Revoking or expiring evidence invalidates dependent evaluations. An already REALIZED unit remains historical but receives a review-required flag.
- Realization requires an explicit, one-use authorization bound to the latest passing evidence evaluation.
- Evidence snapshots use their own nexist-evidence-0.1 JSON format.

The source labels and timestamps are caller-supplied metadata; they do not authenticate the source. The engine has no identity system, access controls, signature verification, multi-user concurrency, or tamper-proof storage. Do not use it to protect confidential data. Read research/EVIDENCE_LIFECYCLE.md for its related-work boundary and limitations.


## NEXIST Q-Intelligence (experimental v0.4)

Q-Intelligence combines the evidence-aware lifecycle with a small p=1 QAOA-style binary selection experiment.

- Candidate decisions are represented by qubits in a local state-vector simulation.
- A diagonal phase separator encodes candidate benefit, resource budget, dependencies, and conflicts.
- An RX mixer explores superpositions; a simple grid search selects gamma and beta.
- The result reports sampled selections, feasibility probability, an exhaustive classical optimum, and the evidence-evaluation IDs that admitted the candidate units.
- The optimization method never changes NEXIST lifecycle states, issues approval, or realizes a unit.

Run the example from this directory:

    python -m examples.q_intelligence

The standard engine uses only the Python standard library and is limited to 12 qubits (2^n state-vector amplitudes). This is intentionally small and runs on ordinary computers. It is a simulator, not a physical quantum processor and not proof of quantum advantage.

For an optional Qiskit Aer circuit sampler, install:

    pip install -r requirements-quantum.txt

The optional adapter samples a QAOA circuit in Qiskit Aer. It still uses a local simulator; a real quantum hardware backend is a separate future integration.

## NEXIST Quantum Neural AI (experimental v0.5)

The AI scoring engine is now a small **variational quantum neural network (QNN)** rather than treating a classical language-model response or QAOA optimizer as the AI itself.

The reference implementation is `nexist/quantum_neural.py` and uses only the Python standard library:

1. Four bounded numeric features are angle-encoded into four qubits using (R_y) and (R_z) rotations.
2. Two trainable variational layers apply (R_y(	heta)), (R_z(	heta)), and entangling CNOT gates.
3. Measurement estimates the Pauli-Z expectation values (langle Z_iangle).
4. A small classical readout maps these expectations to a suitability probability:
   (p(y=1|x)=\sigma(b+\sum_i w_i\langle Z_i\rangle)).
5. The variational parameters are trained from human-labelled examples with the parameter-shift gradient rule:
   \(\partial_\theta\langle Z\rangle=\frac{\langle Z\rangle_{\theta+\pi/2}-\langle Z\rangle_{\theta-\pi/2}}{2}\).

The page's optional OpenRouter connection is only a language-to-structured-proposal convenience. It can draft candidate records from text, but it does not calculate QNN predictions, train the quantum circuit, validate evidence, or authorize a project. The QNN learns from examples the user explicitly labels as suitable or unsuitable. Its suitability probability then adjusts candidate utility inside the QAOA portfolio objective:

\[
U_i = B_i(0.5 + p_i)
\]

where (B_i) is the declared benefit and (p_i) is the QNN suitability probability. The neutral default (p_i=0.5) leaves the declared benefit unchanged. This is a tunable prototype heuristic, not a calibrated real-world probability.

Run the example from this directory:

    python -m examples.quantum_neural

Train a model in Python with `QuantumNeuralNetwork.fit()`, restore it with `QuantumNeuralNetwork.from_dict()`, and pass each prediction's `probability_suitable` into `SelectionCandidate(qnn_suitability=...)`.

### Quantum and research limits

- The model simulates a four-qubit state vector on a classical CPU. It does not currently submit circuits to physical quantum hardware.
- The circuit uses quantum-state amplitudes, parameterized rotation gates, CNOT entanglement, Born-rule measurement, and parameter-shift training. The readout and optimizer are classical; this is a hybrid variational quantum model.
- The model is a small supervised classifier, not a general-purpose conversational or language model. It cannot learn reliable domain knowledge without representative, correctly labelled training data.
- The UI keeps its demonstration labels and learned model in that browser's local storage. They are not shared with the Python package or another device.
- The QNN score never replaces NEXIST's evidence checks. It cannot make a POTENTIAL unit eligible, realize a unit, or prove that a user-entered evidence reference is genuine.
- The exact classical selection reference remains in the QAOA demo. The state-vector/QAOA simulation and QNN do not demonstrate quantum advantage.

The design is an experimental milestone that should be evaluated against classical classifiers on the same labelled dataset, train/test splits, metrics, and hardware. No claim of quantum speedup, greater accuracy, or general quantum advantage is made.
