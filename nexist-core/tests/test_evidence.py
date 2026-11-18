import tempfile
import unittest
from pathlib import Path

from nexist import (
    AuthorizationStatus, CheckStatus, EvidenceAwareEngine, EvidenceStatus,
    EvaluationOutcome, NXState, NXStateError, NXValidationError, Requirement,
)


class EvidenceLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.engine = EvidenceAwareEngine()

    def make_unit(self, name="Lab"):
        unit = self.engine.create(name, "proposal", requirements=[
            Requirement("budget.approved", "gte", 100),
            Requirement("permission", "eq", True),
        ])
        budget = self.engine.record_evidence("budget.approved", 150, "demo://finance/1", "reviewer")
        permission = self.engine.record_evidence("permission", True, "demo://site/1", "reviewer")
        return unit, budget, permission

    def test_pass_records_evidence_and_each_requirement(self):
        unit, budget, permission = self.make_unit()
        evaluation = self.engine.evaluate_with_evidence(unit.id, [budget.id, permission.id])
        self.assertEqual(evaluation.outcome, EvaluationOutcome.ELIGIBLE)
        self.assertEqual(len(evaluation.checks), 2)
        self.assertEqual(set(evaluation.evidence_ids), {budget.id, permission.id})
        self.assertEqual(self.engine.get(unit.id).state, NXState.ELIGIBLE)

    def test_missing_evidence_is_unknown_not_success(self):
        unit = self.engine.create("Unknown", "proposal", requirements=[Requirement("budget", "gte", 10)])
        evaluation = self.engine.evaluate_with_evidence(unit.id, [])
        self.assertEqual(evaluation.checks[0].status, CheckStatus.UNKNOWN)
        self.assertEqual(evaluation.outcome, EvaluationOutcome.INDETERMINATE)
        self.assertEqual(self.engine.get(unit.id).state, NXState.POTENTIAL)

    def test_conflicting_values_are_indeterminate(self):
        unit = self.engine.create("Conflict", "proposal", requirements=[Requirement("budget", "gte", 10)])
        one = self.engine.record_evidence("budget", 12, "source:one", "a")
        two = self.engine.record_evidence("budget", 2, "source:two", "b")
        evaluation = self.engine.evaluate_with_evidence(unit.id, [one.id, two.id])
        self.assertEqual(evaluation.checks[0].status, CheckStatus.CONFLICT)
        self.assertEqual(evaluation.outcome, EvaluationOutcome.INDETERMINATE)

    def test_raw_facts_cannot_bypass_provenance(self):
        unit = self.engine.create("No bypass", "proposal")
        with self.assertRaises(NXStateError):
            self.engine.evaluate(unit.id, {})

    def test_revocation_invalidates_evaluation_and_eligibility(self):
        unit, budget, permission = self.make_unit()
        self.engine.evaluate_with_evidence(unit.id, [budget.id, permission.id])
        self.engine.revoke_evidence(permission.id, "auditor", "withdrawn")
        self.assertEqual(self.engine.get_evidence(permission.id).status, EvidenceStatus.REVOKED)
        self.assertFalse(self.engine.evaluation_is_current(unit.id))
        self.assertEqual(self.engine.get(unit.id).state, NXState.POTENTIAL)

    def test_expiration_invalidates_evidence(self):
        unit = self.engine.create("Timed", "proposal", requirements=[Requirement("ok", "eq", True)])
        evidence = self.engine.record_evidence("ok", True, "source:timed", "reviewer",
            observed_at="2026-01-01T00:00:00Z", expires_at="2026-01-02T00:00:00Z")
        self.engine.evaluate_with_evidence(unit.id, [evidence.id], as_of="2026-01-01T12:00:00Z")
        self.assertEqual(self.engine.expire_due_evidence("2026-01-03T00:00:00Z"), [evidence.id])
        self.assertEqual(self.engine.get(unit.id).state, NXState.POTENTIAL)

    def test_dependency_revocation_propagates(self):
        parent = self.engine.create("Parent", "record", requirements=[Requirement("p", "eq", True)])
        child = self.engine.create("Child", "record", requirements=[Requirement("c", "eq", True)])
        self.engine.add_dependency(child.id, parent.id)
        p = self.engine.record_evidence("p", True, "source:p", "reviewer")
        c = self.engine.record_evidence("c", True, "source:c", "reviewer")
        self.engine.evaluate_with_evidence(parent.id, [p.id])
        self.engine.evaluate_with_evidence(child.id, [c.id])
        self.engine.revoke_evidence(p.id, "auditor", "withdrawn")
        self.assertEqual(self.engine.get(child.id).state, NXState.POTENTIAL)
        self.assertFalse(self.engine.evaluation_is_current(child.id))

    def test_dependency_cycles_are_rejected(self):
        a, b = self.engine.create("A", "record"), self.engine.create("B", "record")
        self.engine.add_dependency(a.id, b.id)
        with self.assertRaises(NXValidationError):
            self.engine.add_dependency(b.id, a.id)

    def test_realization_requires_a_one_use_approval(self):
        unit, budget, permission = self.make_unit()
        self.engine.evaluate_with_evidence(unit.id, [budget.id, permission.id])
        with self.assertRaises(NXStateError):
            self.engine.realize(unit.id, "operator")
        approval = self.engine.authorize_realization(unit.id, "committee", "MINUTES-001")
        self.assertEqual(approval.status, AuthorizationStatus.PENDING)
        self.engine.realize(unit.id, "operator")
        self.assertEqual(self.engine.get(unit.id).state, NXState.REALIZED)
        with self.assertRaises(NXStateError):
            self.engine.realize(unit.id, "operator")

    def test_re_evaluation_invalidates_old_approval(self):
        unit, budget, permission = self.make_unit()
        self.engine.evaluate_with_evidence(unit.id, [budget.id, permission.id])
        approval = self.engine.authorize_realization(unit.id, "committee", "AUTH-OLD")
        newer = self.engine.record_evidence("budget.approved", 180, "demo://finance/2", "reviewer")
        self.engine.evaluate_with_evidence(unit.id, [newer.id, permission.id])
        self.assertEqual(self.engine._authorizations[approval.id].status, AuthorizationStatus.INVALIDATED)
        with self.assertRaises(NXStateError):
            self.engine.realize(unit.id, "operator")

    def test_realized_history_is_preserved_and_reviewed_after_revocation(self):
        unit, budget, permission = self.make_unit()
        self.engine.evaluate_with_evidence(unit.id, [budget.id, permission.id])
        self.engine.authorize_realization(unit.id, "committee", "AUTH-02")
        self.engine.realize(unit.id, "operator")
        self.engine.revoke_evidence(permission.id, "auditor", "source withdrawn")
        self.assertEqual(self.engine.get(unit.id).state, NXState.REALIZED)
        self.assertTrue(self.engine.needs_review(unit.id))
        replacement = self.engine.record_evidence("permission", True, "demo://site/2", "reviewer")
        result = self.engine.review_realization(unit.id, [budget.id, replacement.id], "auditor", "REVIEW-02")
        self.assertEqual(result.outcome, EvaluationOutcome.ELIGIBLE)
        self.assertFalse(self.engine.needs_review(unit.id))
        self.assertEqual(self.engine.get(unit.id).state, NXState.REALIZED)

    def test_evidence_values_are_returned_as_detached_snapshots(self):
        evidence = self.engine.record_evidence("payload", {"values": [1]}, "source", "actor")
        evidence.value["values"].append(9)
        self.assertEqual(self.engine.get_evidence(evidence.id).value, {"values": [1]})

    def test_json_persistence_round_trip(self):
        unit, budget, permission = self.make_unit()
        self.engine.evaluate_with_evidence(unit.id, [budget.id, permission.id])
        self.engine.authorize_realization(unit.id, "committee", "AUTH-SAVE")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            self.engine.save(path)
            restored = EvidenceAwareEngine.load(path)
        self.assertEqual(restored.get(unit.id).state, NXState.ELIGIBLE)
        self.assertEqual(restored.latest_evaluation(unit.id).outcome, EvaluationOutcome.ELIGIBLE)
        restored.realize(unit.id, "operator")
        self.assertEqual(restored.get(unit.id).state, NXState.REALIZED)


if __name__ == "__main__":
    unittest.main()
