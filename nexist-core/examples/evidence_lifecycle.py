"""Runnable example: python -m examples.evidence_lifecycle."""
import tempfile
from pathlib import Path

from nexist import EvidenceAwareEngine, NXState, Requirement


def main():
    engine = EvidenceAwareEngine()
    proposal = engine.create(
        "Community technology lab", "project-proposal",
        requirements=[
            Requirement("budget.approved", "gte", 250_000),
            Requirement("site.permission", "eq", True),
        ],
        actor="proposal-author",
    )
    budget = engine.record_evidence(
        "budget.approved", 300_000, "demo://finance-review/FIN-204", "finance-reviewer",
        metadata={"document_reference": "FIN-204", "demo": True},
    )
    permission = engine.record_evidence(
        "site.permission", True, "demo://site-review/SITE-18", "site-reviewer",
        metadata={"document_reference": "SITE-18", "demo": True},
    )
    evaluation = engine.evaluate_with_evidence(
        proposal.id, [budget.id, permission.id], actor="eligibility-reviewer"
    )
    print("Evaluation:", evaluation.outcome.value)
    for check in evaluation.checks:
        print(f" - {check.fact_path}: {check.status.value}")
    engine.authorize_realization(proposal.id, "project-committee", "DEMO-MINUTES-001")
    engine.realize(proposal.id, "project-coordinator")
    print("After explicit realization:", engine.get(proposal.id).state.value)

    # Evidence withdrawal never erases the historical REALIZED transition.
    engine.revoke_evidence(permission.id, "records-auditor", "Demo source withdrawn")
    print("Review required:", engine.needs_review(proposal.id))
    replacement = engine.record_evidence(
        "site.permission", True, "demo://site-review/SITE-19", "site-reviewer"
    )
    review = engine.review_realization(
        proposal.id, [budget.id, replacement.id], "independent-reviewer", "DEMO-REVIEW-002"
    )
    print("Review outcome:", review.outcome.value)
    print("Review still required:", engine.needs_review(proposal.id))
    assert engine.get(proposal.id).state == NXState.REALIZED
    assert not engine.needs_review(proposal.id)

    with tempfile.TemporaryDirectory() as folder:
        snapshot = Path(folder) / "evidence-demo.json"
        engine.save(snapshot)
        restored = EvidenceAwareEngine.load(snapshot)
        print("Persistence round-trip:", restored.get(proposal.id).state.value)


if __name__ == "__main__":
    main()
