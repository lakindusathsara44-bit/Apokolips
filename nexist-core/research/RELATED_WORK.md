# NEXIST Related-Work Review (Initial)

**Review date:** 18 November 2026  
**Status:** Initial targeted review; not a systematic literature review  
**Scope:** Public primary standards, official technical documentation, and government research sources relevant to the current NEXIST model.

## Executive finding

The current NEXIST v0.2 implementation is a useful experimental packaging of familiar software concepts, but the available evidence does **not** support calling it a new fundamental data structure or a world-first invention.

Its ingredients already have close analogues:

- graph-based resource identity and relationships in RDF;
- typed concepts, individuals, properties, axioms, and inference in OWL;
- declarative predicates and constraints in constraint-modelling languages such as MiniZinc;
- states and transitions in UML state machines;
- event histories and state reconstruction in event-sourcing architectures;
- representations of real or conceptual entities and their lifecycle states in digital-twin research.

This does not prove that every possible NEXIST design is already known. It does mean that simply combining identity, attributes, requirements, graph links, composition, lifecycle states, and event history is not sufficient evidence of novelty. NEXIST must identify a precise capability gap, define it formally, and show that existing combinations cannot provide the same result with comparable clarity and cost.

## 1. Comparison with established approaches

| NEXIST feature | Established overlap | Assessment |
|---|---|---|
| Unit identity, labels, kinds, attributes | Objects, records, entities, and ontology individuals | Standard modelling capability |
| Named relationships between units | RDF subject-predicate-object graphs | Strong conceptual overlap |
| Declared requirements checked against facts | Constraint programming and rule evaluation | Standard declarative evaluation pattern |
| POTENTIAL / ELIGIBLE / REALIZED / ARCHIVED | UML state machines and workflow lifecycles | Standard state-transition modelling |
| Composition and parent lineage | Object composition, graph provenance, and ontology constructors | Familiar modelling pattern |
| Recorded events and history | Event sourcing and audit/event logs | Established architecture |
| Representing a not-yet-realised possibility | Planning models, design-time models, digital twins, and constraint models | Not sufficient by itself to establish novelty |

### 1.1 RDF — graph data model

W3C RDF 1.1 defines a graph as a set of subject-predicate-object triples. It is designed to express descriptions of resources and supports named graphs and datasets. NEXIST's `link()` operation and directed named relations are a much smaller, application-specific graph mechanism. RDF already provides a standard, interoperable way to represent connected resources.

Source: W3C, [RDF 1.1 Concepts and Abstract Syntax](https://www.w3.org/TR/rdf-concepts/).

### 1.2 OWL 2 — ontology and reasoning

OWL 2 represents classes, properties, individuals, and data values with formally defined meaning. Its axioms and constructors can express structured knowledge, while reasoners can check consistency and infer implicit information. NEXIST currently has labels, kinds, attributes, and relationships but does not offer OWL's formal semantics or general reasoning. It should not present those basic modelling features as new.

Source: W3C, [OWL 2 Web Ontology Language Primer](https://www.w3.org/TR/owl2-primer/).

### 1.3 MiniZinc — declarative constraints

MiniZinc is a high-level, typed modelling language for constraint-satisfaction and optimisation problems. Its specification describes declarative constraints, separation of model from data, type checking, and solver-independent modelling. NEXIST's current requirement evaluator is far narrower: it checks a small set of predicates against a supplied facts snapshot and does not solve an optimisation problem.

Source: MiniZinc, [Specification of MiniZinc](https://docs.minizinc.org/en/stable/spec.html).

### 1.4 UML — lifecycle states and transitions

The Object Management Group publishes the UML 2.5.1 specification and machine-readable metamodels. State-machine modelling is an established way to describe states and allowed transitions. NEXIST's four lifecycle labels and explicit transition checks are useful domain rules, but a lifecycle alone is not a novel primitive.

Source: OMG, [Unified Modeling Language Specification](https://www.omg.org/spec/UML/).

### 1.5 Event sourcing — event history

AWS's event-sourcing guidance describes state changes as events stored in an append-only sequence; a current or historical view can be rebuilt by replaying those events. NEXIST currently records an event list, but does not yet rebuild authoritative state by replaying events. It should therefore say "event history" or "audit log", not claim full event sourcing.

Source: AWS Prescriptive Guidance, [Event sourcing pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing-pattern.html).

### 1.6 Digital twins — real and conceptual entities across lifecycle states

NIST IR 8356 describes digital twins as electronic representations of real-world entities, including non-physical processes and conceptual models, and discusses state transitions and evaluation. The NIST glossary also defines a machine-readable specification describing features that may be modelled for a type of real-world entity. These sources make it especially important not to claim that representing conceptual or not-yet-realised entities is, by itself, unique to NEXIST.

Sources: NIST, [IR 8356 — Security and Trust Considerations for Digital Twin Technology](https://csrc.nist.gov/pubs/ir/8356/final), and [digital twin definition](https://csrc.nist.gov/glossary/term/digital_twin_definition).

## 2. What NEXIST currently is — and is not

The defensible description is:

> NEXIST is an experimental, stateful data-model prototype that packages potential-entity records, declarative prerequisite evaluation, composition lineage, explicit lifecycle transitions, and recorded history behind one Python API.

It is currently:
- a Python library and a small browser demonstration;
- a single-process, in-memory engine with versioned JSON persistence;
- a restricted predicate evaluator;
- an experimental API that is compared against a conventional implementation.

It is not currently:
- a new CPU, instruction set, storage primitive, or programming language;
- a theorem prover or general-purpose constraint solver;
- a database, distributed consistency system, or complete event-sourcing platform;
- a physical creation or deployment system;
- proven to be novel, faster, or more expressive than established alternatives.

## 3. A possible research question

A researchable question is:

**Does a first-class potential-entity lifecycle, where a declared unit carries its own prerequisites, composition lineage, evaluation provenance, and explicit realisation gate, reduce implementation complexity or improve auditability in multi-stage proposal modelling compared with an equivalent conventional implementation?**

This is a question, not a result.

The most promising candidate differentiator is not a new kind of object. It is the *semantics and interaction contract* between:
1. a persistent identity for a possibility;
2. a frozen record of which facts snapshot was used to evaluate it;
3. explainable, per-condition evaluation outcomes;
4. dependency-aware invalidation when those facts change;
5. explicit authorisation of the transition from eligible to realised;
6. composition where parent requirements, evidence, and lifecycle constraints propagate in a formally defined way.

Only items 1–3 are partially represented today. Items 4–6 need a formal design and implementation before they can be tested as a candidate contribution. Even then, they must be compared with workflow engines, constraint systems, digital-twin platforms, and event-sourced approaches.

## 4. Evidence gaps and research boundaries

This targeted review is not exhaustive. It does not include a systematic academic database search, patent search, implementation study of commercial workflow/PLM tools, or exhaustive analysis of possible-worlds and planning literature. It cannot establish priority or prove non-existence of similar work.

Before using words such as "novel", "first", or "new data structure" in a paper or public announcement, carry out:
- a documented systematic literature search with search strings, databases, inclusion/exclusion criteria, and publication dates;
- a patent and standards search;
- an implementation-level comparison against suitable existing systems;
- an independent review by someone familiar with data modelling and knowledge representation.

## 5. Research decision

**Current decision: continue as an experimental model; do not claim novelty yet.**

A meaningful next milestone is to define the candidate differentiator as formal invariants and state/evidence semantics, then test those semantics in a real scenario. If an equivalent combination of RDF/OWL, a constraint solver, a state machine, and an event log can provide the same capability just as cleanly, NEXIST's contribution may be an API or engineering pattern rather than a new data structure. That is a legitimate result; it is better than overstating the claim.
