# NEXIST — NX Data Model Specification

**Document status:** Draft research specification  
**Target implementation:** Python core prototype  
**Version:** 0.2-draft  
**Compatibility:** This document formalises the current prototype direction. It is not a standards-track specification and does not claim proven novelty.

## 1. Purpose

NEXIST explores a structured way to represent a digital entity as a *declared possibility* before it is explicitly marked as realised within the model. An NX Unit combines identity, descriptive attributes, declarative requirements, typed relationships, composition lineage, lifecycle state, and an event history.

The intended research question is not whether these ingredients can be implemented in ordinary software—they can. The question is whether giving them one explicit model and lifecycle yields a measurable improvement in a defined class of problems.

## 2. Scope and terminology

- **NX Unit:** the record managed by a NEXIST engine.
- **Facts snapshot:** external, caller-supplied JSON-compatible data used for one evaluation.
- **Requirement:** a declarative predicate over a path in a facts snapshot.
- **Eligible:** all requirements passed for the facts snapshot used in the most recent evaluation.
- **Realised:** an explicit state recorded inside the NEXIST model. This does not imply physical creation or an external side effect.
- **Composition:** creation of a new unit with parent lineage and inherited requirements.

NEXIST v0.2 is an in-memory Python prototype with JSON persistence. It is not a database, distributed transaction system, programming language, operating system, or new hardware primitive. The engine is not thread-safe.

## 3. NX Unit data model

An NX Unit contains:

| Field | Meaning |
|---|---|
| `id` | Unique opaque identifier |
| `label` | Human-readable name |
| `kind` | Caller-defined semantic category |
| `state` | One of the lifecycle states below |
| `attributes` | JSON-compatible descriptive object |
| `requirements` | Ordered list of declarative requirements |
| `relations` | Directed, named references to other units |
| `parent_ids` | Composition lineage |
| `events` | Append-only-by-engine event records |

The prototype uses JSON-compatible values for persistence. It does not execute expressions supplied in requirements.

## 4. Lifecycle semantics

| State | Meaning | Permitted next action |
|---|---|---|
| `POTENTIAL` | Declared; requirements are not currently satisfied or have not passed | Evaluate, archive |
| `ELIGIBLE` | Every requirement passed against the latest supplied facts snapshot | Re-evaluate, realise, archive |
| `REALIZED` | Explicitly marked realised inside the model | Archive |
| `ARCHIVED` | Inactive historical record | None |

Creating a unit starts it in `POTENTIAL`. Evaluation does not realise a unit. Only an explicit `realize(unit_id, actor)` call can move an eligible unit to `REALIZED`. A realised unit cannot be re-evaluated in this prototype. Archived units cannot be used as active relationship endpoints or composition parents.

A unit with no requirements passes evaluation by vacuous truth. This rule is deliberate and must remain documented and tested.

## 5. Requirement language

A requirement is a triple: `(path, operator, expected)`. Paths address nested object keys in the supplied facts snapshot.

Supported operators:

| Operator | Meaning |
|---|---|
| `eq` / `ne` | JSON-aware equality / inequality |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison; booleans are not numbers for this purpose |
| `exists` | The path is present; a present `null` value still exists |
| `in` | Actual value is in an expected list/string, or is a key in an expected object |
| `contains` | Expected value is contained by an actual list/string, or is a key in an actual object |

A missing path fails every operator except `ne`; `exists` checks presence. Invalid or type-incompatible comparisons return a failed check rather than executing arbitrary code. A caller must pass a facts snapshot explicitly; unit attributes are not silently substituted for facts.

## 6. Operations

- `create`: validate and register a potential unit.
- `get` / `list_units`: retrieve unit records, optionally filtering by state or kind.
- `link`: add a directed, named relationship.
- `compose`: create a child unit with unique parent IDs, copied parent requirements, and local requirements. All inherited and local requirements are conjunctive.
- `evaluate`: evaluate every requirement against a facts snapshot and record per-requirement outcomes.
- `realize`: explicitly record the eligible-to-realised transition.
- `archive`: mark a record inactive without deleting its history.
- `save` / `load`: persist and restore a versioned JSON snapshot.

Composition currently records lineage and combines requirements. It does not infer emergent properties, discover hidden capabilities, or automatically create external resources.

## 7. Invariants and validation targets

1. Unit IDs are unique within an engine.
2. Labels, kinds, actors, and relation names are non-empty strings.
3. Requirement operators belong to the supported operator set.
4. Attributes and facts are JSON-compatible objects with string keys.
5. A unit can be realised only from `ELIGIBLE`.
6. Evaluating a unit never performs real-world actions.
7. A loaded relation target or composition parent must refer to a unit in the same saved engine.
8. Event records are retained across save/load.
9. Publicly returned unit records must not allow callers to bypass engine validation by mutating internal state.
10. Invalid persisted data must fail explicitly rather than partially loading a corrupt graph.

## 8. Persistence and security boundary

The persistence format is versioned JSON. It is intended for local development and reproducible examples, not concurrent multi-process access. Applications requiring concurrent writes, access control, or transactional guarantees must use a suitable database layer.

Requirement evaluation is a small data comparison language. It must not call `eval`, dynamically import modules, execute Python snippets, access the filesystem, or perform network operations. Any future expression language would require a separate threat model and parser.

## 9. Research hypotheses

These are hypotheses to test, not established results:

- **H1 — Modelling clarity:** for selected scenarios involving proposed entities, prerequisites, relationships, and lifecycle history, an NX Unit model is easier for developers to inspect and reason about than separately hand-wired records and state transitions.
- **H2 — Auditability:** recording evaluation outcomes and explicit state transitions makes the reason for a unit's current model-state easier to reconstruct.
- **H3 — Composition reuse:** inheriting requirements and retaining parent lineage reduces duplicated prerequisite definitions in multi-part proposals.

## 10. Evaluation plan

A credible evaluation must compare NEXIST with a transparent baseline: ordinary Python data classes or dictionaries, a graph representation for relations, and a conventional constraint evaluator. Use identical input scenarios and report:

- correctness against a published set of expected outcomes;
- invalid-transition and malformed-input handling;
- ability to reconstruct state and lineage from persistence;
- developer effort or code complexity for the same scenario;
- runtime and memory across multiple dataset sizes.

The baseline must offer equivalent features where possible. A faster but feature-incomplete baseline comparison is not valid evidence. Publish scripts, test data, runtime versions, hardware details, repetitions, and raw results. Do not infer novelty from a benchmark alone.

## 11. Known limitations and next milestones

The prototype is single-process and in-memory, has no database transactions or concurrency guarantees, and does not infer probability, uncertainty, causal effects, or emergent properties. Its concepts overlap with established object models, knowledge representation, graph structures, constraint systems, workflow/state machines, and event-sourced designs.

Next milestones: (1) review related work; (2) freeze lifecycle and missing-value semantics; (3) build a representative benchmark corpus; (4) compare with the baseline; (5) revise the model only where evidence shows a real gap.

**Research integrity note:** NEXIST is an experimental project. No claim that it is unprecedented, industry-changing, or a new fundamental computing primitive is made by this specification.
