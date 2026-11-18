# NEXIST Evidence-Aware Potential Lifecycle

**Status:** experimental candidate and prototype, not a standards-track specification  
**Version:** 0.1  
**Date:** 18 November 2026

## Research question

Can an evidence-linked lifecycle make it easier to explain why a proposed digital entity is eligible, identify the exact records supporting that decision, and determine what must be rechecked when evidence is withdrawn, expires, or a dependency changes?

This is a research question, not a claim that NEXIST is a new fundamental data structure. The existing NEXIST review already identifies overlap with RDF/OWL, declarative constraints, state machines, event histories, and digital twins. This extension implements an interaction pattern to test; it does not establish novelty.

## Model

The prototype separates five record types:

- **NX Unit:** the existing entity-like record and lifecycle.
- **Evidence:** a caller-supplied fact value with a source label, submitting actor, observation and record timestamps, optional expiry, metadata, and revocation status.
- **Evidence evaluation:** a result containing per-requirement outcomes, the evidence IDs used, evaluation time, and dependency evaluation IDs.
- **Dependency:** a directed prerequisite link between units. Composition parent links also count as dependencies.
- **Realisation authorization:** a one-use approval bound to a particular current passing evaluation.

Per-requirement outcomes are PASS, FAIL, UNKNOWN, and CONFLICT. No selected valid evidence yields UNKNOWN; disagreeing active records for one fact path yield CONFLICT. Overall results are ELIGIBLE, INELIGIBLE, or INDETERMINATE. Unknown and conflicting evidence never count as success.

## Lifecycle rules

1. An evaluation stores the exact evidence IDs and the result of each requirement check.
2. Evidence may include observation and expiry times. Time is timezone-aware and explicitly supplied; no background timer is used.
3. Revocation or expiry invalidates current evaluations that relied on the affected record.
4. Invalidation propagates through dependent units. An eligible unit returns to POTENTIAL; pending authorizations are invalidated.
5. A REALIZED unit remains historically REALIZED after its evidence changes, but is marked review required. This preserves the recorded transition while surfacing changed justification.
6. A later evidence-based review can clear the flag when all checks pass; it does not erase the old history.
7. Realisation requires an explicit one-use approval tied to the current passing evaluation.
8. Dependency graphs must be acyclic, and a dependent unit can be evaluated only when each dependency has a current passing evaluation and no pending review.

REALIZED means a state recorded inside the model. It does not create a physical object or execute an external side effect.

## Provenance and security boundary

The source, actor, timestamps, metadata, and evidence IDs provide traceability inside the program. They do not authenticate external sources. A caller could submit a false source label or timestamp. The prototype does not provide digital-signature verification, trusted timestamping, identity management, access control, tamper-proof remote logs, or source-document verification. A real deployment would need authenticated submitters and source documents, authorization controls, signed or hashed artefacts, durable audit storage, retention rules, and a threat model.

The engine remains a local, single-process Python prototype with JSON snapshots. It is not thread-safe or a multi-user database. Do not use it to protect confidential records.

## Related work and novelty boundary

The candidate must be compared with established standards:

- W3C PROV-O describes provenance using entities, activities, agents, derivation, and invalidation: https://www.w3.org/TR/prov-o/
- W3C PROV Constraints defines constraints on valid provenance records and temporal relations: https://www.w3.org/TR/prov-constraints/
- W3C SHACL specifies validation of RDF graphs using shapes and validation reports: https://www.w3.org/TR/shacl/
- RDF/OWL, constraint modelling, UML state machines, and event-sourcing systems cover other parts of the overall design.

The current prototype packages evidence records, predicate evaluation, dependency invalidation, review flags, and an approval gate behind one Python API. Combining these features is not, by itself, evidence of novelty. A formal comparison must test whether the API offers a meaningful modelling or auditability benefit over PROV + SHACL, conventional state-machine/workflow code, and suitable lifecycle platforms.

This is a targeted note, not a systematic literature review, patent search, or proof of priority. No world-first or new fundamental data structure claim is justified.

## Implemented API

EvidenceAwareEngine is exposed separately; the original NexistEngine remains available:

- record_evidence(), get_evidence(), list_evidence()
- evaluate_with_evidence(), latest_evaluation(), evaluation_is_current()
- revoke_evidence(), expire_due_evidence()
- add_dependency(), dependencies_of()
- authorize_realization(), realize(), review_realization(), needs_review()
- save() and load() use the separate nexist-evidence-0.1 format

The evidence-aware engine refuses the base evaluate(facts=...) entry point so that provenance cannot be silently bypassed through that API. Evidence labels are metadata, not verified facts.

## Evaluation plan

The automated tests cover provenance retention, unknown and conflicting evidence, raw-facts bypass, revocation and expiry invalidation, dependency propagation and cycle checks, one-use authorisation, approval invalidation, review of historically realised units, detached snapshots, and persistence. This is implementation validation, not a usability study or comparative performance finding.

A further study should compare equivalent scenarios against PROV-O/SHACL plus conventional workflow components, measure developer effort and audit reconstruction accuracy, publish reproducible cases, and include independent review.
