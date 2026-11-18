"""Run with: python -m examples.q_intelligence."""
from nexist import (
    EvidenceAwareEngine,
    NexistQIntelligence,
    Requirement,
    SelectionCandidate,
)


def main():
    evidence = EvidenceAwareEngine()
    projects = [
        ("Solar classroom", 90, 4, "FIN-001"),
        ("Computer lab", 100, 6, "FIN-002"),
        ("Library network", 65, 3, "FIN-003"),
        ("Teacher training", 55, 2, "FIN-004"),
    ]
    candidates = []
    for label, benefit, cost, reference in projects:
        unit = evidence.create(
            label,
            "project-proposal",
            requirements=[Requirement("approval", "eq", True)],
            actor="proposal-author",
        )
        proof = evidence.record_evidence(
            "approval",
            True,
            f"demo://committee/{reference}",
            "demo-reviewer",
            metadata={"reference": reference, "synthetic_demo": True},
        )
        evidence.evaluate_with_evidence(unit.id, [proof.id], actor="demo-evaluator")
        candidates.append(SelectionCandidate(unit.id, benefit, cost))

    result = NexistQIntelligence(evidence).optimize_eligible(
        candidates,
        budget=9,
        shots=2048,
        seed=27,
    )
    print("Backend:", result.selection.backend)
    print("Qubits:", result.selection.qubits_used)
    print("Evidence evaluations used:", len(result.evaluation_snapshots))
    print("Selected:", list(result.selection.selected_unit_ids))
    print("Benefit:", result.selection.measured_benefit)
    print("Resource use:", result.selection.measured_resource_cost)
    print("Feasible:", result.selection.measured_feasible)
    print("QAOA expected score:", round(result.selection.expected_score, 3))
    print("Exact classical reference:", list(result.selection.exact_classical_unit_ids))
    print("Unit lifecycle states were not changed by optimization.")


if __name__ == "__main__":
    main()
