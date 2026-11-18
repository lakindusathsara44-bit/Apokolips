# NEXIST — Python Core Prototype

NEXIST is an experimental data-model prototype for representing **potential digital entities** as NX Units. This folder contains the Python core engine used as the initial implementation of the model.

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
