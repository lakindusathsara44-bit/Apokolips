"""Run with: python -m examples.q_intelligence.

The small training labels below are illustrative and must not be treated as
validated domain knowledge.
"""
from nexist import (
    EvidenceAwareEngine,
    NexistQIntelligence,
    QuantumNeuralNetwork,
    QuantumTrainingExample,
    Requirement,
    SelectionCandidate,
)


def main():
    training = [
        QuantumTrainingExample((0.90, 0.85, 0.80, 0.90), 1),
        QuantumTrainingExample((0.80, 0.70, 0.75, 0.65), 1),
        QuantumTrainingExample((0.10, 0.20, 0.15, 0.25), 0),
        QuantumTrainingExample((0.25, 0.30, 0.20, 0.10), 0),
        QuantumTrainingExample((0.75, 0.60, 0.55, 0.80), 1),
        QuantumTrainingExample((0.15, 0.35, 0.25, 0.20), 0),
    ]
    qnn = QuantumNeuralNetwork(qubits=4, layers=2, seed=17)
    training_summary = qnn.fit(training, epochs=120, learning_rate=0.08)

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

        budget = 9.0
        features = (
            benefit / (benefit + 10.0),
            benefit / (benefit + cost + 1.0),
            max(0.0, min(1.0, 1.0 - cost / budget)),
            1.0,
        )
        suitability = qnn.predict(features).probability_suitable
        candidates.append(
            SelectionCandidate(unit.id, benefit, cost, qnn_suitability=suitability)
        )
        print(f"{label}: QNN suitability={suitability:.3f}")

    result = NexistQIntelligence(evidence).optimize_eligible(
        candidates,
        budget=9,
        shots=2048,
        seed=27,
    )
    print("QNN training:", training_summary)
    print("QNN backend: local four-qubit variational state-vector simulation")
    print("QAOA backend:", result.selection.backend)
    print("QAOA qubits:", result.selection.qubits_used)
    print("Evidence evaluations used:", len(result.evaluation_snapshots))
    print("Selected:", list(result.selection.selected_unit_ids))
    print("Declared benefit:", result.selection.measured_benefit)
    print("QNN-adjusted utility:", result.selection.measured_ai_adjusted_benefit)
    print("Mean QNN suitability:", result.selection.measured_qnn_suitability)
    print("Resource use:", result.selection.measured_resource_cost)
    print("Feasible:", result.selection.measured_feasible)
    print("Physical quantum hardware: False")


if __name__ == "__main__":
    main()
