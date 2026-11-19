import unittest

from nexist import (
    EvidenceAwareEngine, NexistQIntelligence, NXState, NXStateError,
    NXValidationError, Requirement, SelectionCandidate, solve_selection,
)


class QIntelligenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = EvidenceAwareEngine()

    def _eligible(self, label, source):
        unit = self.engine.create(label, "project", requirements=[
            Requirement("approval", "eq", True)
        ])
        evidence = self.engine.record_evidence("approval", True, source, "reviewer")
        self.engine.evaluate_with_evidence(unit.id, [evidence.id], actor="evaluator")
        return unit, evidence

    def test_statevector_qaoa_returns_bounded_result_and_classical_reference(self):
        candidates = [
            SelectionCandidate("a", benefit=9, resource_cost=4),
            SelectionCandidate("b", benefit=8, resource_cost=3),
            SelectionCandidate("c", benefit=5, resource_cost=2),
        ]
        result = solve_selection(candidates, budget=5, shots=256, seed=4)
        self.assertEqual(result.qubits_used, 3)
        self.assertEqual(result.shots, 256)
        self.assertEqual(result.backend, "nexist-statevector-qaoa-p1")
        self.assertLessEqual(result.measured_resource_cost, 5)
        self.assertTrue(result.measured_feasible)
        self.assertEqual(result.exact_classical_unit_ids, ("b", "c"))
        self.assertGreaterEqual(result.feasible_probability, 0.0)
        self.assertLessEqual(result.feasible_probability, 1.0)

    def test_dependencies_and_conflicts_are_hard_constraints(self):
        candidates = [
            SelectionCandidate("parent", 3, 2),
            SelectionCandidate("child", 10, 2),
            SelectionCandidate("rival", 9, 2),
        ]
        result = solve_selection(
            candidates, budget=4,
            dependencies=[("child", "parent")],
            conflicts=[("child", "rival")],
            shots=1024, seed=9,
        )
        self.assertTrue(result.measured_feasible)
        self.assertNotIn(("child", "rival"), [(a, b) for a in result.selected_unit_ids for b in result.selected_unit_ids])
        self.assertTrue(
            "child" not in result.selected_unit_ids or "parent" in result.selected_unit_ids
        )
        self.assertFalse(
            "child" in result.selected_unit_ids and "rival" in result.selected_unit_ids
        )

    def test_only_current_evidence_eligible_units_can_enter_qaoa(self):
        a, evidence_a = self._eligible("Project A", "source:A")
        b, evidence_b = self._eligible("Project B", "source:B")
        intelligence = NexistQIntelligence(self.engine)
        result = intelligence.optimize_eligible(
            [
                SelectionCandidate(a.id, 10, 2),
                SelectionCandidate(b.id, 8, 3),
            ],
            budget=5,
            shots=256,
        )
        self.assertEqual(len(result.evaluation_snapshots), 2)
        self.assertEqual(self.engine.get(a.id).state, NXState.ELIGIBLE)
        self.assertEqual(self.engine.get(b.id).state, NXState.ELIGIBLE)
        self.assertIn(evidence_a.id, result.evaluation_snapshots[0][2])
        self.assertIn(evidence_b.id, result.evaluation_snapshots[1][2])

    def test_revoked_evidence_blocks_quantum_optimization(self):
        unit, evidence = self._eligible("Project", "source:one")
        self.engine.revoke_evidence(evidence.id, "auditor", "withdrawn")
        with self.assertRaises(NXStateError):
            NexistQIntelligence(self.engine).optimize_eligible(
                [SelectionCandidate(unit.id, 10, 1)], budget=2
            )
        self.assertEqual(self.engine.get(unit.id).state, NXState.POTENTIAL)

    def test_potential_units_are_rejected(self):
        unit = self.engine.create("Not approved", "project")
        with self.assertRaises(NXStateError):
            NexistQIntelligence(self.engine).optimize_eligible(
                [SelectionCandidate(unit.id, 5, 1)], budget=2
            )

    def test_dependency_cycles_are_rejected(self):
        candidates = [
            SelectionCandidate("a", 1, 1),
            SelectionCandidate("b", 1, 1),
        ]
        with self.assertRaises(NXValidationError):
            solve_selection(candidates, budget=2, dependencies=[("a", "b"), ("b", "a")])

    def test_invalid_inputs_are_rejected(self):
        with self.assertRaises(NXValidationError):
            solve_selection([], budget=10)
        with self.assertRaises(NXValidationError):
            solve_selection([SelectionCandidate("a", 1, 1)], budget=-1)
        with self.assertRaises(NXValidationError):
            solve_selection([SelectionCandidate("a", 1, 1)], budget=1, shots=1)
        with self.assertRaises(NXValidationError):
            solve_selection([
                SelectionCandidate("a", 1, 1),
                SelectionCandidate("a", 2, 1),
            ], budget=1)

    def test_candidate_limit_protects_exponential_statevector(self):
        candidates = [SelectionCandidate(f"u{i}", 1, 1) for i in range(13)]
        with self.assertRaises(NXValidationError):
            solve_selection(candidates, budget=13)

    def test_trained_qnn_suitability_changes_qaoa_utility(self):
        candidates = [
            SelectionCandidate("high-raw-benefit", 10, 1, qnn_suitability=0.0),
            SelectionCandidate("high-qnn-suitability", 8, 1, qnn_suitability=1.0),
        ]
        result = solve_selection(candidates, budget=1, shots=256, seed=3)
        self.assertEqual(result.exact_classical_unit_ids, ("high-qnn-suitability",))
        self.assertGreaterEqual(result.measured_ai_adjusted_benefit, 0.0)
        self.assertGreaterEqual(result.measured_qnn_suitability, 0.0)
        self.assertLessEqual(result.measured_qnn_suitability, 1.0)

    def test_qnn_suitability_must_be_a_probability(self):
        with self.assertRaises(NXValidationError):
            SelectionCandidate("bad", 5, 1, qnn_suitability=1.1)


if __name__ == "__main__":
    unittest.main()
