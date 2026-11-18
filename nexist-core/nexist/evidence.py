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

