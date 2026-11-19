"""Evidence-gated QAOA selection with optional QNN suitability weighting.

The dependency-free state-vector implementation is a small research demo for
at most 12 binary decisions. It accepts predictions from the variational QNN
module but does not train the QNN itself. Neither simulator is a quantum
hardware driver or evidence of quantum advantage.
"""
from __future__ import annotations

import cmath
import math
import random
from dataclasses import dataclass
from typing import Iterable, Sequence

from .evidence import EvidenceAwareEngine, EvaluationOutcome
from .model import NXState, NXStateError, NXValidationError


MAX_QUBITS = 12


@dataclass(frozen=True)
class SelectionCandidate:
    """A binary decision tied to an evidence-eligible NEXIST unit."""

    unit_id: str
    benefit: float
    resource_cost: float
    qnn_suitability: float = 0.5

    def __post_init__(self) -> None:
        if not isinstance(self.unit_id, str) or not self.unit_id.strip():
            raise NXValidationError("Candidate unit_id must be a non-empty string.")
        for name, value in (("benefit", self.benefit), ("resource_cost", self.resource_cost)):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise NXValidationError(f"Candidate {name} must be numeric.")
            if not math.isfinite(float(value)) or value < 0:
                raise NXValidationError(f"Candidate {name} must be finite and non-negative.")
        if (
            isinstance(self.qnn_suitability, bool)
            or not isinstance(self.qnn_suitability, (int, float))
            or not math.isfinite(float(self.qnn_suitability))
            or not 0.0 <= float(self.qnn_suitability) <= 1.0
        ):
            raise NXValidationError("Candidate qnn_suitability must be finite and in [0, 1].")


@dataclass(frozen=True)
class QAOAResult:
    backend: str
    qubits_used: int
    shots: int
    gamma: float
    beta: float
    expected_score: float
    uniform_baseline_score: float
    feasible_probability: float
    selected_unit_ids: tuple[str, ...]
    measured_score: float
    measured_resource_cost: float
    measured_benefit: float
    measured_ai_adjusted_benefit: float
    measured_qnn_suitability: float
    measured_feasible: bool
    measured_count: int
    exact_classical_unit_ids: tuple[str, ...]
    exact_classical_score: float
    sample_counts: tuple[tuple[str, int, float, bool], ...]
    notes: tuple[str, ...]


@dataclass(frozen=True)
class EvidenceBackedQAOAResult:
    selection: QAOAResult
    evaluation_snapshots: tuple[tuple[str, str, tuple[str, ...]], ...]


@dataclass(frozen=True)
class _Problem:
    candidates: tuple[SelectionCandidate, ...]
    budget: float
    dependencies: tuple[tuple[str, str], ...]
    conflicts: tuple[tuple[str, str], ...]
    penalty: float
    scores: tuple[float, ...]
    resource_costs: tuple[float, ...]
    benefits: tuple[float, ...]
    adjusted_benefits: tuple[float, ...]
    qnn_suitability: tuple[float, ...]
    feasible: tuple[bool, ...]


def _prepare_problem(
    candidates: Sequence[SelectionCandidate],
    budget: float,
    dependencies: Iterable[tuple[str, str]] = (),
    conflicts: Iterable[tuple[str, str]] = (),
) -> _Problem:
    items = tuple(candidates)
    if not items or len(items) > MAX_QUBITS:
        raise NXValidationError(f"Provide between 1 and {MAX_QUBITS} candidates.")
    if any(not isinstance(item, SelectionCandidate) for item in items):
        raise NXValidationError("Every candidate must be a SelectionCandidate.")
    ids = [item.unit_id for item in items]
    if len(set(ids)) != len(ids):
        raise NXValidationError("Candidate unit IDs must be unique.")
    if isinstance(budget, bool) or not isinstance(budget, (int, float)):
        raise NXValidationError("Budget must be numeric.")
    if not math.isfinite(float(budget)) or budget < 0:
        raise NXValidationError("Budget must be finite and non-negative.")
    known = set(ids)

    def validate_pairs(values: Iterable[tuple[str, str]], label: str):
        clean = []
        for pair in values:
            if not isinstance(pair, (tuple, list)) or len(pair) != 2:
                raise NXValidationError(f"Each {label} must contain two candidate IDs.")
            left, right = pair
            if left not in known or right not in known or left == right:
                raise NXValidationError(f"Invalid {label}: {pair!r}")
            clean.append((str(left), str(right)))
        if len(set(clean)) != len(clean):
            raise NXValidationError(f"{label.capitalize()} must not contain duplicates.")
        return tuple(clean)

    deps = validate_pairs(dependencies, "dependency")
    conflict_pairs = validate_pairs(conflicts, "conflict")
    dependency_graph = {item_id: set() for item_id in ids}
    for child_id, parent_id in deps:
        dependency_graph[child_id].add(parent_id)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        if node in visiting:
            raise NXValidationError("Selection dependencies must be acyclic.")
        if node in visited:
            return
        visiting.add(node)
        for parent_id in dependency_graph[node]:
            visit(parent_id)
        visiting.remove(node)
        visited.add(node)

    for node in dependency_graph:
        visit(node)
    adjusted_total = sum(
        float(item.benefit) * (0.5 + float(item.qnn_suitability)) for item in items
    )
    penalty = max(1.0, adjusted_total + 1.0)
    scores, costs, benefits, adjusted_benefits, qnn_means, feasible = [], [], [], [], [], []
    for mask in range(1 << len(items)):
        selected = {items[i].unit_id for i in range(len(items)) if mask & (1 << i)}
        selected_items = [items[i] for i in range(len(items)) if mask & (1 << i)]
        total_cost = sum(float(item.resource_cost) for item in selected_items)
        total_benefit = sum(float(item.benefit) for item in selected_items)
        adjusted_benefit = sum(
            float(item.benefit) * (0.5 + float(item.qnn_suitability))
            for item in selected_items
        )
        mean_qnn = (
            sum(float(item.qnn_suitability) for item in selected_items) / len(selected_items)
            if selected_items else 0.5
        )
        violations = 0
        if total_cost > float(budget):
            violations += 1
        if any(child in selected and parent not in selected for child, parent in deps):
            violations += 1
        if any(left in selected and right in selected for left, right in conflict_pairs):
            violations += 1
        score = adjusted_benefit - penalty * violations
        scores.append(score)
        costs.append(total_cost)
        benefits.append(total_benefit)
        adjusted_benefits.append(adjusted_benefit)
        qnn_means.append(mean_qnn)
        feasible.append(violations == 0)
    return _Problem(
        items, float(budget), deps, conflict_pairs, penalty,
        tuple(scores), tuple(costs), tuple(benefits), tuple(adjusted_benefits),
        tuple(qnn_means), tuple(feasible),
    )


def _run_statevector(problem: _Problem, gamma: float, beta: float) -> list[complex]:
    """Apply H^n, a diagonal phase separator, then an RX mixer layer."""
    size = len(problem.scores)
    scale = max((abs(value) for value in problem.scores), default=1.0) or 1.0
    amplitudes = [1.0 / math.sqrt(size)] * size
    for mask, score in enumerate(problem.scores):
        amplitudes[mask] *= cmath.exp(1j * gamma * (score / scale))

    cosine, sine = math.cos(beta), math.sin(beta)
    for qubit in range(len(problem.candidates)):
        bit = 1 << qubit
        for mask in range(size):
            if mask & bit:
                continue
            zero, one = amplitudes[mask], amplitudes[mask | bit]
            amplitudes[mask] = cosine * zero - 1j * sine * one
            amplitudes[mask | bit] = -1j * sine * zero + cosine * one
    return amplitudes


def _distribution(amplitudes: Sequence[complex]) -> list[float]:
    probabilities = [float(value.real * value.real + value.imag * value.imag) for value in amplitudes]
    total = sum(probabilities)
    if not math.isfinite(total) or total <= 0:
        raise NXValidationError("Quantum state has an invalid probability norm.")
    return [value / total for value in probabilities]


def _mask_ids(problem: _Problem, mask: int) -> tuple[str, ...]:
    return tuple(problem.candidates[i].unit_id
                 for i in range(len(problem.candidates)) if mask & (1 << i))


def _format_mask(problem: _Problem, mask: int) -> str:
    return "".join("1" if mask & (1 << i) else "0"
                   for i in range(len(problem.candidates) - 1, -1, -1))


def solve_selection(
    candidates: Sequence[SelectionCandidate],
    budget: float,
    *,
    dependencies: Iterable[tuple[str, str]] = (),
    conflicts: Iterable[tuple[str, str]] = (),
    gamma_steps: int = 16,
    beta_steps: int = 16,
    shots: int = 1024,
    seed: int = 17,
) -> QAOAResult:
    """Run a p=1 QAOA parameter grid on a local state-vector simulator.

    The simulator computes 2**n amplitudes. It is intentionally capped at 12
    qubits so the public demo cannot trigger unbounded exponential workloads.
    """
    if isinstance(gamma_steps, bool) or not isinstance(gamma_steps, int) or not 4 <= gamma_steps <= 32:
        raise NXValidationError("gamma_steps must be an integer from 4 to 32.")
    if isinstance(beta_steps, bool) or not isinstance(beta_steps, int) or not 4 <= beta_steps <= 32:
        raise NXValidationError("beta_steps must be an integer from 4 to 32.")
    if isinstance(shots, bool) or not isinstance(shots, int) or not 32 <= shots <= 10000:
        raise NXValidationError("shots must be an integer from 32 to 10000.")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise NXValidationError("seed must be an integer.")

    problem = _prepare_problem(candidates, budget, dependencies, conflicts)
    uniform_baseline = sum(problem.scores) / len(problem.scores)
    best_expected = -math.inf
    best_gamma, best_beta, best_probabilities = 0.0, 0.0, []
    for gamma_index in range(gamma_steps):
        gamma = (2.0 * math.pi * gamma_index) / gamma_steps
        for beta_index in range(beta_steps):
            beta = (math.pi * beta_index) / beta_steps
            probabilities = _distribution(_run_statevector(problem, gamma, beta))
            expectation = sum(probabilities[i] * problem.scores[i]
                              for i in range(len(probabilities)))
            if expectation > best_expected + 1e-12:
                best_expected = expectation
                best_gamma, best_beta, best_probabilities = gamma, beta, probabilities

    rng = random.Random(seed)
    cumulative, running = [], 0.0
    for probability in best_probabilities:
        running += probability
        cumulative.append(running)
    counts = [0] * len(cumulative)
    for _ in range(shots):
        value = rng.random()
        lo, hi = 0, len(cumulative)
        while lo < hi:
            middle = (lo + hi) // 2
            if value <= cumulative[middle]:
                hi = middle
            else:
                lo = middle + 1
        counts[min(lo, len(counts) - 1)] += 1

    sampled = [i for i, count in enumerate(counts) if count]
    chosen = max(sampled, key=lambda i: (problem.feasible[i], problem.scores[i], counts[i], -i))
    exact = max(range(len(problem.scores)),
                key=lambda i: (problem.feasible[i], problem.scores[i], -i))
    feasible_probability = sum(best_probabilities[i] for i, valid in enumerate(problem.feasible) if valid)
    top = sorted(sampled, key=lambda i: (problem.scores[i], counts[i], -i), reverse=True)[:8]
    rows = tuple((_format_mask(problem, i), counts[i], problem.scores[i], problem.feasible[i]) for i in top)
    notes = (
        "p=1 QAOA-style circuit: Hadamard superposition, diagonal cost phase, and RX mixer.",
        "Local exact state-vector simulation only; this run did not use a physical quantum processor.",
        "A grid search selects circuit angles; sampling is probabilistic and may miss the exact optimum.",
        "A trained QNN suitability probability scales each candidate benefit by (0.5 + probability); the neutral default 0.5 leaves raw benefit unchanged.",
        "The exhaustive classical optimum is reported as a correctness baseline, not as a quantum disadvantage claim.",
    )
    return QAOAResult(
        backend="nexist-statevector-qaoa-p1",
        qubits_used=len(problem.candidates),
        shots=shots,
        gamma=best_gamma,
        beta=best_beta,
        expected_score=best_expected,
        uniform_baseline_score=uniform_baseline,
        feasible_probability=feasible_probability,
        selected_unit_ids=_mask_ids(problem, chosen),
        measured_score=problem.scores[chosen],
        measured_resource_cost=problem.resource_costs[chosen],
        measured_benefit=problem.benefits[chosen],
        measured_ai_adjusted_benefit=problem.adjusted_benefits[chosen],
        measured_qnn_suitability=problem.qnn_suitability[chosen],
        measured_feasible=problem.feasible[chosen],
        measured_count=counts[chosen],
        exact_classical_unit_ids=_mask_ids(problem, exact),
        exact_classical_score=problem.scores[exact],
        sample_counts=rows,
        notes=notes,
    )


class NexistQIntelligence:
    """Connect evidence-current NEXIST units to the QAOA selection simulator.

    It returns a recommendation and the exact evaluation IDs used. It never
    changes unit states, grants authorization, or realizes a unit.
    """

    def __init__(self, evidence_engine: EvidenceAwareEngine):
        if not isinstance(evidence_engine, EvidenceAwareEngine):
            raise NXValidationError("NexistQIntelligence requires an EvidenceAwareEngine.")
        self.evidence_engine = evidence_engine

    def optimize_eligible(
        self,
        candidates: Sequence[SelectionCandidate],
        budget: float,
        *,
        dependencies: Iterable[tuple[str, str]] = (),
        conflicts: Iterable[tuple[str, str]] = (),
        gamma_steps: int = 16,
        beta_steps: int = 16,
        shots: int = 1024,
        seed: int = 17,
    ) -> EvidenceBackedQAOAResult:
        snapshots = []
        for candidate in candidates:
            unit = self.evidence_engine.get(candidate.unit_id)
            evaluation = self.evidence_engine.latest_evaluation(candidate.unit_id)
            if (
                unit.state != NXState.ELIGIBLE
                or evaluation is None
                or evaluation.outcome != EvaluationOutcome.ELIGIBLE
                or evaluation.purpose != "evaluation"
                or not self.evidence_engine.evaluation_is_current(candidate.unit_id)
            ):
                raise NXStateError(
                    f"Candidate {candidate.unit_id} needs a current passing evidence evaluation."
                )
            snapshots.append((candidate.unit_id, evaluation.id, evaluation.evidence_ids))
        result = solve_selection(
            candidates, budget, dependencies=dependencies, conflicts=conflicts,
            gamma_steps=gamma_steps, beta_steps=beta_steps, shots=shots, seed=seed,
        )
        return EvidenceBackedQAOAResult(result, tuple(snapshots))
