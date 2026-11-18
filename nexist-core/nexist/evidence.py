"""Experimental evidence-linked lifecycle extension for NEXIST.

Evidence provenance is descriptive metadata supplied by callers. Recording a
source label does not authenticate that source or make this local engine secure.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Mapping
from uuid import uuid4

from .engine import NexistEngine
from .model import NXState, NXStateError, NXValidationError, NXNotFoundError, Requirement


class EvidenceStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class CheckStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    UNKNOWN = "unknown"
    CONFLICT = "conflict"


class EvaluationOutcome(str, Enum):
    ELIGIBLE = "eligible"
    INELIGIBLE = "ineligible"
    INDETERMINATE = "indeterminate"


class AuthorizationStatus(str, Enum):
    PENDING = "pending"
    CONSUMED = "consumed"
    INVALIDATED = "invalidated"


@dataclass(frozen=True)
class NXEvidence:
    id: str
    fact_path: str
    value: Any
    source: str
    actor: str
    observed_at: str
    recorded_at: str
    expires_at: str | None = None
    status: EvidenceStatus = EvidenceStatus.ACTIVE
    metadata: dict[str, Any] | None = None
    revoked_at: str | None = None
    revoked_by: str | None = None
    revocation_reason: str | None = None


@dataclass(frozen=True)
class EvidenceCheck:
    requirement_index: int
    fact_path: str
    operator: str
    expected: Any
    status: CheckStatus
    actual_present: bool
    actual_value: Any = None
    evidence_ids: tuple[str, ...] = ()
    reason: str = ""


@dataclass(frozen=True)
class EvidenceEvaluation:
    id: str
    unit_id: str
    actor: str
    evaluated_at: str
    purpose: str
    outcome: EvaluationOutcome
    is_current: bool
    evidence_ids: tuple[str, ...]
    dependency_evaluations: dict[str, str]
    checks: tuple[EvidenceCheck, ...]


@dataclass(frozen=True)
class RealizationAuthorization:
    id: str
    unit_id: str
    approver: str
    reference: str
    evaluation_id: str
    authorized_at: str
    status: AuthorizationStatus = AuthorizationStatus.PENDING
    consumed_at: str | None = None


class EvidenceAwareEngine(NexistEngine):
    """NEXIST extension: evidence snapshots, invalidation, and approval gating."""

    EVIDENCE_FORMAT_VERSION = "nexist-evidence-0.1"

    def __init__(self) -> None:
        super().__init__()
        self._evidence: dict[str, NXEvidence] = {}
        self._evaluations: dict[str, EvidenceEvaluation] = {}
        self._latest_evaluation: dict[str, str] = {}
        self._dependencies: dict[str, set[str]] = {}
        self._authorizations: dict[str, RealizationAuthorization] = {}
        self._pending_authorization: dict[str, str] = {}
        self._review_required: set[str] = set()

    # Evidence records -------------------------------------------------
    def record_evidence(
        self, fact_path: str, value: Any, source: str, actor: str, *,
        observed_at: str | datetime | None = None,
        expires_at: str | datetime | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> NXEvidence:
        Requirement(fact_path, "exists")
        self._validate_actor(actor)
        self._validate_text(source, "Evidence source")
        self._validate_json(value, "Evidence value")
        if metadata is not None and not isinstance(metadata, Mapping):
            raise NXValidationError("Evidence metadata must be a mapping.")
        details = copy.deepcopy(dict(metadata or {}))
        self._validate_json(details, "Evidence metadata")
        observed = self._time(observed_at)
        expiry = self._time(expires_at) if expires_at is not None else None
        if expiry is not None and expiry <= observed:
            raise NXValidationError("Evidence expiry must follow its observation time.")
        item = NXEvidence(
            f"nxe_{uuid4().hex}", fact_path, copy.deepcopy(value), source.strip(),
            actor.strip(), self._stamp(observed), self._stamp(self._now()),
            self._stamp(expiry) if expiry else None, metadata=details,
        )
        self._evidence[item.id] = item
        return copy.deepcopy(item)

    def get_evidence(self, evidence_id: str) -> NXEvidence:
        try:
            return copy.deepcopy(self._evidence[evidence_id])
        except KeyError as exc:
            raise NXNotFoundError(f"Evidence not found: {evidence_id}") from exc

    def list_evidence(self, *, status: EvidenceStatus | str | None = None) -> list[NXEvidence]:
        try:
            selected = EvidenceStatus(status) if status is not None else None
        except ValueError as exc:
            raise NXValidationError(f"Unknown evidence status: {status!r}") from exc
        return [copy.deepcopy(e) for e in self._evidence.values()
                if selected is None or e.status == selected]

    def revoke_evidence(self, evidence_id: str, actor: str, reason: str) -> NXEvidence:
        self._validate_actor(actor)
        self._validate_text(reason, "Revocation reason")
        try:
            evidence = self._evidence[evidence_id]
        except KeyError as exc:
            raise NXNotFoundError(f"Evidence not found: {evidence_id}") from exc
        if evidence.status != EvidenceStatus.ACTIVE:
            raise NXStateError("Only active evidence can be revoked.")
        self._evidence[evidence_id] = replace(
            evidence, status=EvidenceStatus.REVOKED, revoked_at=self._stamp(self._now()),
            revoked_by=actor.strip(), revocation_reason=reason.strip(),
        )
        roots = [uid for uid, eid in self._latest_evaluation.items()
                 if evidence_id in self._evaluations[eid].evidence_ids
                 and self._evaluations[eid].is_current]
        invalidated: set[str] = set()
        for root in roots:
            self._invalidate_tree(root, "evidence_revoked", evidence_id, invalidated=invalidated)
        return self.get_evidence(evidence_id)

    def expire_due_evidence(self, as_of: str | datetime | None = None) -> list[str]:
        moment = self._time(as_of)
        expired = []
        for eid, item in list(self._evidence.items()):
            if (item.status == EvidenceStatus.ACTIVE and item.expires_at
                    and self._parse(item.expires_at) <= moment):
                self._evidence[eid] = replace(item, status=EvidenceStatus.EXPIRED)
                expired.append(eid)
        invalidated: set[str] = set()
        for eid in expired:
            roots = [uid for uid, ev_id in self._latest_evaluation.items()
                     if eid in self._evaluations[ev_id].evidence_ids
                     and self._evaluations[ev_id].is_current]
            for root in roots:
                self._invalidate_tree(root, "evidence_expired", eid, invalidated=invalidated)
        return expired

    # Dependency graph -------------------------------------------------
    def _dependencies_of(self, unit_id: str) -> set[str]:
        unit = self._get_internal(unit_id)
        return set(unit.parent_ids) | set(self._dependencies.get(unit_id, set()))

    def dependencies_of(self, unit_id: str) -> list[str]:
        self._get_internal(unit_id)
        return sorted(self._dependencies_of(unit_id))

    def _depends_on(self, unit_id: str, target: str) -> bool:
        todo, seen = list(self._dependencies_of(unit_id)), set()
        while todo:
            current = todo.pop()
            if current == target:
                return True
            if current not in seen:
                seen.add(current)
                todo.extend(self._dependencies_of(current))
        return False

    def _dependents(self, root: str) -> set[str]:
        found, todo = set(), [root]
        while todo:
            current = todo.pop()
            for candidate in self._units:
                if candidate not in found and current in self._dependencies_of(candidate):
                    found.add(candidate)
                    todo.append(candidate)

        return found

    def add_dependency(self, unit_id: str, dependency_id: str, actor: str = "system") -> None:
        self._validate_actor(actor)
        unit, dependency = self._get_internal(unit_id), self._get_internal(dependency_id)
        self._require_active(unit)
        self._require_active(dependency)
        if unit_id == dependency_id or self._depends_on(dependency_id, unit_id):
            raise NXValidationError("Dependency graph must be acyclic and non-reflexive.")
        if dependency_id in self._dependencies_of(unit_id):
            raise NXValidationError("Dependency already exists.")
        if unit.state == NXState.REALIZED:
            raise NXStateError("A realised unit cannot gain new dependencies.")
        self._dependencies.setdefault(unit_id, set()).add(dependency_id)
        self._record(unit, "dependency_added", actor, {"dependency_id": dependency_id})
        self._invalidate_tree(unit_id, "dependency_graph_changed")

    # Evaluation -------------------------------------------------------
    def evaluate(self, unit_id: str, facts: Mapping[str, Any], actor: str = "system"):
        raise NXStateError("Use evaluate_with_evidence(); raw facts are disabled in this engine.")

    def evaluate_with_evidence(
        self, unit_id: str, evidence_ids: Iterable[str], actor: str = "system", *,
        as_of: str | datetime | None = None,
    ) -> EvidenceEvaluation:
        return self._evaluate(unit_id, evidence_ids, actor, as_of, "evaluation")

    def _evaluate(self, unit_id, evidence_ids, actor, as_of, purpose) -> EvidenceEvaluation:
        unit = self._get_internal(unit_id)
        self._validate_actor(actor)
        self._require_active(unit)
        if unit.state == NXState.REALIZED and purpose != "realization_review":
            raise NXStateError("A realised unit must be checked through review_realization().")
        if purpose == "realization_review" and unit.state != NXState.REALIZED:
            raise NXStateError("Realisation review requires a realised unit.")
        moment = self._time(as_of)
        if isinstance(evidence_ids, (str, bytes)):
            raise NXValidationError("Evidence IDs must be a collection, not a string.")
        selected_ids = list(evidence_ids)
        if any(not isinstance(x, str) or not x for x in selected_ids) or len(set(selected_ids)) != len(selected_ids):
            raise NXValidationError("Evidence IDs must be unique non-empty strings.")
        selected = []
        for eid in selected_ids:
            if eid not in self._evidence:
                raise NXNotFoundError(f"Evidence not found: {eid}")
            selected.append(self._evidence[eid])

        dependency_snapshot = {}
        for dependency_id in self._dependencies_of(unit_id):
            dep = self._get_internal(dependency_id)
            latest = self.latest_evaluation(dependency_id)
            if (dep.state not in {NXState.ELIGIBLE, NXState.REALIZED} or latest is None
                    or latest.outcome != EvaluationOutcome.ELIGIBLE
                    or not self._is_current(latest, moment) or dependency_id in self._review_required):
                raise NXStateError(f"Dependency {dependency_id} is not currently eligible.")
            dependency_snapshot[dependency_id] = latest.id

        checks, used = [], set()
        for index, req in enumerate(unit.requirements):
            matching = [e for e in selected if e.fact_path == req.path]
            valid = [e for e in matching if e.status == EvidenceStatus.ACTIVE
                     and self._parse(e.observed_at) <= moment
                     and self._parse(e.recorded_at) <= moment
                     and (e.expires_at is None or self._parse(e.expires_at) > moment)]
            ids = tuple(e.id for e in matching)
            if not valid:
                checks.append(EvidenceCheck(index, req.path, req.operator, copy.deepcopy(req.expected),
                    CheckStatus.UNKNOWN, False, None, ids, "No selected active evidence is valid at this time."))
                used.update(ids)
            elif any(not self._json_equal(valid[0].value, e.value) for e in valid[1:]):
                checks.append(EvidenceCheck(index, req.path, req.operator, copy.deepcopy(req.expected),
                    CheckStatus.CONFLICT, True, None, tuple(e.id for e in valid), "Evidence values conflict."))
                used.update(e.id for e in valid)
            else:
                passed = self._matches(valid[0].value, req)
                checks.append(EvidenceCheck(index, req.path, req.operator, copy.deepcopy(req.expected),
                    CheckStatus.PASS if passed else CheckStatus.FAIL, True,
                    copy.deepcopy(valid[0].value), tuple(e.id for e in valid),
                    "Requirement satisfied." if passed else "Evidence value does not satisfy the requirement."))
                used.update(e.id for e in valid)

        if any(c.status == CheckStatus.FAIL for c in checks):
            outcome = EvaluationOutcome.INELIGIBLE
        elif any(c.status in {CheckStatus.UNKNOWN, CheckStatus.CONFLICT} for c in checks):
            outcome = EvaluationOutcome.INDETERMINATE
        else:
            outcome = EvaluationOutcome.ELIGIBLE

        previous_id = self._latest_evaluation.get(unit_id)
        if previous_id:
            previous = self._evaluations[previous_id]
            self._evaluations[previous_id] = replace(previous, is_current=False)
            # Including the root clears any approval tied to the old evaluation.
            self._invalidate_tree(unit_id, "evaluation_changed")

        result = EvidenceEvaluation(
            f"nxeval_{uuid4().hex}", unit_id, actor.strip(), self._stamp(moment), purpose,
            outcome, True, tuple(sorted(used)), dict(sorted(dependency_snapshot.items())), tuple(checks),
        )
        self._evaluations[result.id] = result
        self._latest_evaluation[unit_id] = result.id
        if purpose == "evaluation":
            unit.state = NXState.ELIGIBLE if outcome == EvaluationOutcome.ELIGIBLE else NXState.POTENTIAL
        elif outcome == EvaluationOutcome.ELIGIBLE:
            self._review_required.discard(unit_id)
        else:
            self._review_required.add(unit_id)
        self._record(unit, "evidence_evaluated", actor, {
            "evaluation_id": result.id, "outcome": outcome.value, "purpose": purpose,
            "evidence_ids": list(result.evidence_ids),
        })
        return copy.deepcopy(result)

    def latest_evaluation(self, unit_id: str) -> EvidenceEvaluation | None:
        self._get_internal(unit_id)
        eid = self._latest_evaluation.get(unit_id)
        return copy.deepcopy(self._evaluations[eid]) if eid else None

    def _is_current(self, evaluation: EvidenceEvaluation, moment: datetime) -> bool:
        if not evaluation.is_current:
            return False
        for eid in evaluation.evidence_ids:
            item = self._evidence.get(eid)
            if item is None or item.status != EvidenceStatus.ACTIVE:
                return False
            if self._parse(item.observed_at) > moment or self._parse(item.recorded_at) > moment:
                return False
            if item.expires_at and self._parse(item.expires_at) <= moment:
                return False
        for uid, evaluation_id in evaluation.dependency_evaluations.items():
            latest = self._latest_evaluation.get(uid)
            if latest != evaluation_id or uid in self._review_required:
                return False
            dep = self._evaluations.get(evaluation_id)
            if dep is None or not self._is_current(dep, moment):
                return False
        return True

    def evaluation_is_current(self, unit_id: str, *, as_of: str | datetime | None = None) -> bool:
        evaluation = self.latest_evaluation(unit_id)
        return bool(evaluation and self._is_current(evaluation, self._time(as_of)))

    # Approval and realization ----------------------------------------
    def authorize_realization(self, unit_id: str, approver: str, authorization_reference: str):
        self._validate_actor(approver)
        self._validate_text(authorization_reference, "Authorization reference")
        self.expire_due_evidence()
        unit, evaluation = self._get_internal(unit_id), self.latest_evaluation(unit_id)
        if (unit.state != NXState.ELIGIBLE or evaluation is None
                or evaluation.outcome != EvaluationOutcome.ELIGIBLE
                or evaluation.purpose != "evaluation" or unit_id in self._review_required
                or not self._is_current(evaluation, self._now())):
            raise NXStateError("Only a currently eligible unit can be authorised.")
        old_id = self._pending_authorization.pop(unit_id, None)
        if old_id:
            self._authorizations[old_id] = replace(self._authorizations[old_id], status=AuthorizationStatus.INVALIDATED)
        auth = RealizationAuthorization(
            f"nxauth_{uuid4().hex}", unit_id, approver.strip(), authorization_reference.strip(),
            evaluation.id, self._stamp(self._now()),
        )
        self._authorizations[auth.id] = auth
        self._pending_authorization[unit_id] = auth.id
        self._record(unit, "realization_authorized", approver, {"authorization_id": auth.id, "evaluation_id": evaluation.id})
        return copy.deepcopy(auth)

    def realize(self, unit_id: str, actor: str):
        self._validate_actor(actor)
        self.expire_due_evidence()
        unit, evaluation = self._get_internal(unit_id), self.latest_evaluation(unit_id)
        auth_id = self._pending_authorization.get(unit_id)
        auth = self._authorizations.get(auth_id) if auth_id else None
        if (auth is None or auth.status != AuthorizationStatus.PENDING or evaluation is None
                or auth.evaluation_id != evaluation.id or unit.state != NXState.ELIGIBLE
                or not self._is_current(evaluation, self._now())):
            raise NXStateError("Realisation requires an unused approval for the current evaluation.")
        unit_snapshot = super().realize(unit_id, actor)
        self._authorizations[auth.id] = replace(auth, status=AuthorizationStatus.CONSUMED,
                                               consumed_at=self._stamp(self._now()))
        self._pending_authorization.pop(unit_id, None)
        self._record(unit, "realization_authorization_consumed", actor, {"authorization_id": auth.id})
        return unit_snapshot

    def review_realization(self, unit_id: str, evidence_ids: Iterable[str], reviewer: str,
                           review_reference: str, *, as_of: str | datetime | None = None):
        unit = self._get_internal(unit_id)
        if unit.state != NXState.REALIZED or unit_id not in self._review_required:
            raise NXStateError("This realised unit does not currently require review.")
        self._validate_text(review_reference, "Review reference")
        result = self._evaluate(unit_id, evidence_ids, reviewer, as_of, "realization_review")
        self._record(unit, "realization_reviewed", reviewer, {
            "evaluation_id": result.id, "review_reference": review_reference.strip(),
            "outcome": result.outcome.value,
        })
        return result

    def needs_review(self, unit_id: str) -> bool:
        self._get_internal(unit_id)
        return unit_id in self._review_required

    def archive(self, unit_id: str, actor: str = "system"):
        result = super().archive(unit_id, actor)
        self._invalidate_tree(unit_id, "dependency_archived", include_root=False)
        return result

    # Invalidation -----------------------------------------------------
    def _invalidate_tree(self, root: str, reason: str, evidence_id: str | None = None,
                         *, include_root: bool = True, invalidated: set[str] | None = None) -> None:
        affected = ({root} if include_root else set()) | self._dependents(root)
        for uid in sorted(affected):
            if invalidated is not None and uid in invalidated:
                continue
            if invalidated is not None:
                invalidated.add(uid)
            unit = self._get_internal(uid)
            eid = self._latest_evaluation.get(uid)
            if eid and self._evaluations[eid].is_current:
                self._evaluations[eid] = replace(self._evaluations[eid], is_current=False)
            auth_id = self._pending_authorization.pop(uid, None)
            if auth_id:
                self._authorizations[auth_id] = replace(self._authorizations[auth_id], status=AuthorizationStatus.INVALIDATED)
            if unit.state == NXState.ELIGIBLE:
                unit.state = NXState.POTENTIAL
            elif unit.state == NXState.REALIZED:
                self._review_required.add(uid)
            event = "evidence_invalidated" if uid == root and reason.startswith("evidence_") else "dependency_invalidated" if uid != root else "evaluation_invalidated"
            self._record(unit, event, "system", {"root_unit_id": root, "reason": reason,
                "evidence_id": evidence_id, "review_required": uid in self._review_required})

    # JSON persistence -------------------------------------------------
    def save(self, path: str | Path) -> None:
        payload = {
            "format": self.EVIDENCE_FORMAT_VERSION,
            "base": {"format": self.FORMAT_VERSION,
                     "units": [self._unit_to_dict(u) for u in self._units.values()]},
            "evidence": [self._evidence_dict(e) for e in self._evidence.values()],
            "evaluations": [self._evaluation_dict(e) for e in self._evaluations.values()],
            "latest_evaluation": self._latest_evaluation,
            "dependencies": {k: sorted(v) for k, v in self._dependencies.items()},
            "authorizations": [self._authorization_dict(a) for a in self._authorizations.values()],
            "review_required": sorted(self._review_required),
        }
        dest, temp = Path(path), None
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False)
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=dest.parent,
                    prefix=f".{dest.name}.", suffix=".tmp", delete=False) as handle:
                temp = handle.name
                handle.write(data); handle.flush(); os.fsync(handle.fileno())
            os.replace(temp, dest); temp = None
        except (OSError, TypeError, ValueError) as exc:
            raise NXValidationError(f"Could not save evidence-aware data: {exc}") from exc
        finally:
            if temp and os.path.exists(temp):
                os.unlink(temp)

    @classmethod
    def load(cls, path: str | Path) -> "EvidenceAwareEngine":
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise NXValidationError(f"Could not load evidence-aware data: {exc}") from exc
        if not isinstance(data, Mapping) or data.get("format") != cls.EVIDENCE_FORMAT_VERSION:
            raise NXValidationError("Unsupported evidence-aware file format.")
        base = data.get("base")
        if not isinstance(base, Mapping) or base.get("format") not in {cls.FORMAT_VERSION, "nexist-0.1"}:
            raise NXValidationError("Invalid base NEXIST snapshot.")
        raw_units = base.get("units")
        if not isinstance(raw_units, list):
            raise NXValidationError("Base units must be a list.")
        engine = cls()
        for raw in raw_units:
            unit = cls._unit_from_dict(raw)
            if unit.id in engine._units:
                raise NXValidationError("Duplicate NX Unit ID.")
            engine._units[unit.id] = unit
        engine._validate_references()
        for raw in data.get("evidence", []):
            item = cls._evidence_from_dict(raw)
            if item.id in engine._evidence:
                raise NXValidationError("Duplicate evidence ID.")
            engine._evidence[item.id] = item
        for raw in data.get("evaluations", []):
            item = cls._evaluation_from_dict(raw)
            if item.id in engine._evaluations or item.unit_id not in engine._units:
                raise NXValidationError("Duplicate or unknown evaluation reference.")
            if any(eid not in engine._evidence for eid in item.evidence_ids):
                raise NXValidationError("Evaluation references unknown evidence.")
            engine._evaluations[item.id] = item
        latest = data.get("latest_evaluation", {})
        if not isinstance(latest, Mapping):
            raise NXValidationError("Latest evaluation index must be an object.")
        for uid, eid in latest.items():
            if uid not in engine._units or eid not in engine._evaluations or engine._evaluations[eid].unit_id != uid:
                raise NXValidationError("Invalid latest evaluation reference.")
            if not engine._evaluations[eid].is_current:
                raise NXValidationError("Latest evaluation must be current.")
            engine._latest_evaluation[uid] = eid
        deps = data.get("dependencies", {})
        if not isinstance(deps, Mapping):
            raise NXValidationError("Dependencies must be an object.")
        for uid, values in deps.items():
            if uid not in engine._units or not isinstance(values, list) or any(x not in engine._units for x in values):
                raise NXValidationError("Invalid dependency entry.")
            if len(set(values)) != len(values) or uid in values:
                raise NXValidationError("Dependency entries must be unique and non-reflexive.")
            engine._dependencies[uid] = set(values)
        if any(engine._depends_on(uid, uid) for uid in engine._units):
            raise NXValidationError("Dependency graph must be acyclic.")
        for raw in data.get("authorizations", []):
            auth = cls._authorization_from_dict(raw)
            if auth.id in engine._authorizations or auth.unit_id not in engine._units:
                raise NXValidationError("Invalid authorization reference.")
            if auth.evaluation_id not in engine._evaluations or engine._evaluations[auth.evaluation_id].unit_id != auth.unit_id:
                raise NXValidationError("Authorization references an unknown evaluation.")
            engine._authorizations[auth.id] = auth
            if auth.status == AuthorizationStatus.PENDING:
                if auth.unit_id in engine._pending_authorization:
                    raise NXValidationError("Multiple pending approvals for one unit.")
                engine._pending_authorization[auth.unit_id] = auth.id
        review = data.get("review_required", [])
        if not isinstance(review, list) or any(uid not in engine._units for uid in review):
            raise NXValidationError("Invalid review-required list.")
        engine._review_required = set(review)
        if any(engine._units[uid].state != NXState.REALIZED for uid in review):
            raise NXValidationError("Only realised units can require review.")
        for uid, unit in engine._units.items():
            latest_id = engine._latest_evaluation.get(uid)
            latest_eval = engine._evaluations.get(latest_id) if latest_id else None
            if unit.state == NXState.ELIGIBLE and (latest_eval is None or latest_eval.outcome != EvaluationOutcome.ELIGIBLE or latest_eval.purpose != "evaluation"):
                raise NXValidationError("Eligible units require a current passing evidence evaluation.")
            if unit.state == NXState.REALIZED and latest_eval is None:
                raise NXValidationError("Realised units require an evidence evaluation.")
        for uid, aid in engine._pending_authorization.items():
            auth = engine._authorizations[aid]
            if engine._latest_evaluation.get(uid) != auth.evaluation_id or engine._units[uid].state != NXState.ELIGIBLE:
                raise NXValidationError("Pending approval is not bound to the current eligible evaluation.")
        return engine

    @staticmethod
    def _evidence_dict(item: NXEvidence) -> dict[str, Any]:
        result = asdict(item); result["status"] = item.status.value
        return result

    @staticmethod
    def _evidence_from_dict(raw: Mapping[str, Any]) -> NXEvidence:
        try:
            return NXEvidence(
                raw["id"], raw["fact_path"], raw["value"], raw["source"], raw["actor"],
                raw["observed_at"], raw["recorded_at"], raw.get("expires_at"),
                EvidenceStatus(raw["status"]), raw.get("metadata", {}), raw.get("revoked_at"),
                raw.get("revoked_by"), raw.get("revocation_reason"),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise NXValidationError(f"Invalid evidence record: {exc}") from exc

    @staticmethod
    def _evaluation_dict(item: EvidenceEvaluation) -> dict[str, Any]:
        return {"id": item.id, "unit_id": item.unit_id, "actor": item.actor,
            "evaluated_at": item.evaluated_at, "purpose": item.purpose,
            "outcome": item.outcome.value, "is_current": item.is_current,
            "evidence_ids": list(item.evidence_ids), "dependency_evaluations": item.dependency_evaluations,
            "checks": [{**asdict(c), "status": c.status.value, "evidence_ids": list(c.evidence_ids)} for c in item.checks]}

    @staticmethod
    def _evaluation_from_dict(raw: Mapping[str, Any]) -> EvidenceEvaluation:
        try:
            checks = tuple(EvidenceCheck(
                c["requirement_index"], c["fact_path"], c["operator"], c["expected"],
                CheckStatus(c["status"]), c["actual_present"], c.get("actual_value"),
                tuple(c.get("evidence_ids", [])), c.get("reason", "")) for c in raw["checks"])
            return EvidenceEvaluation(raw["id"], raw["unit_id"], raw["actor"], raw["evaluated_at"],
                raw["purpose"], EvaluationOutcome(raw["outcome"]), raw["is_current"],
                tuple(raw["evidence_ids"]), dict(raw["dependency_evaluations"]), checks)
        except (KeyError, TypeError, ValueError) as exc:
            raise NXValidationError(f"Invalid evidence evaluation: {exc}") from exc

    @staticmethod
    def _authorization_dict(item: RealizationAuthorization) -> dict[str, Any]:
        result = asdict(item); result["status"] = item.status.value
        return result

    @staticmethod
    def _authorization_from_dict(raw: Mapping[str, Any]) -> RealizationAuthorization:
        try:
            return RealizationAuthorization(raw["id"], raw["unit_id"], raw["approver"], raw["reference"],
                raw["evaluation_id"], raw["authorized_at"], AuthorizationStatus(raw["status"]), raw.get("consumed_at"))
        except (KeyError, TypeError, ValueError) as exc:
            raise NXValidationError(f"Invalid realization authorization: {exc}") from exc

    # Time helpers -----------------------------------------------------
    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @classmethod
    def _time(cls, value: str | datetime | None) -> datetime:
        if value is None:
            return cls._now()
        if isinstance(value, datetime):
            if value.tzinfo is None or value.utcoffset() is None:
                raise NXValidationError("Timestamp must include a timezone.")
            return value.astimezone(timezone.utc)
        return cls._parse(value)

    @staticmethod
    def _parse(value: str) -> datetime:
        if not isinstance(value, str) or not value.strip():
            raise NXValidationError("Timestamp must be a non-empty ISO string.")
        try:
            result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise NXValidationError("Invalid ISO timestamp.") from exc
        if result.tzinfo is None or result.utcoffset() is None:
            raise NXValidationError("Timestamp must include a timezone.")
        return result.astimezone(timezone.utc)

    @staticmethod
    def _stamp(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
