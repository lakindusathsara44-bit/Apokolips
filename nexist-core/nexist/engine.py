"""In-memory NEXIST engine with declarative requirement evaluation."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from .model import (
    NXError,
    NXEvent,
    NXNotFoundError,
    NXRelation,
    NXState,
    NXStateError,
    NXUnit,
    NXValidationError,
    Requirement,
)


class NexistEngine:
    FORMAT_VERSION = "nexist-0.1"

    def __init__(self) -> None:
        self._units: dict[str, NXUnit] = {}

    def create(
        self,
        label: str,
        kind: str,
        attributes: Mapping[str, Any] | None = None,
        requirements: list[Requirement] | None = None,
        actor: str = "system",
    ) -> NXUnit:
        if not isinstance(label, str) or not label.strip():
            raise NXValidationError("Unit label must be a non-empty string.")
        if not isinstance(kind, str) or not kind.strip():
            raise NXValidationError("Unit kind must be a non-empty string.")
        if not isinstance(actor, str) or not actor.strip():
            raise NXValidationError("Actor must be a non-empty string.")
        if attributes is not None and not isinstance(attributes, Mapping):
            raise NXValidationError("Attributes must be a mapping.")
        reqs = list(requirements or [])
        if any(not isinstance(item, Requirement) for item in reqs):
            raise NXValidationError("Every requirement must be a Requirement.")
        unit = NXUnit.new(label.strip(), kind.strip(), attributes, reqs)
        self._record(unit, "created", actor, {"label": unit.label, "kind": unit.kind})
        self._units[unit.id] = unit
        return unit

    def get(self, unit_id: str) -> NXUnit:
        try:
            return self._units[unit_id]
        except KeyError as exc:
            raise NXNotFoundError(f"NX Unit not found: {unit_id}") from exc

    def link(
        self, source_id: str, target_id: str, relation: str, actor: str = "system"
    ) -> NXUnit:
        source = self.get(source_id)
        target = self.get(target_id)
        self._validate_actor(actor)
        self._require_active(source)
        self._require_active(target)
        if not isinstance(relation, str) or not relation.strip():
            raise NXValidationError("Relation name must be a non-empty string.")
        source.relations.append(NXRelation(target.id, relation.strip()))
        self._record(source, "linked", actor, {
            "target_id": target.id, "relation": relation.strip()
        })
        return source

    def compose(
        self,
        parent_ids: list[str],
        label: str,
        kind: str = "composite",
        attributes: Mapping[str, Any] | None = None,
        requirements: list[Requirement] | None = None,
        actor: str = "system",
    ) -> NXUnit:
        self._validate_actor(actor)
        if len(parent_ids) < 2 or len(set(parent_ids)) != len(parent_ids):
            raise NXValidationError("Composition requires at least two unique parents.")
        parents = [self.get(parent_id) for parent_id in parent_ids]
        for parent in parents:
            self._require_active(parent)
        inherited = [
            requirement
            for parent in parents
            for requirement in parent.requirements
        ]
        combined = inherited + list(requirements or [])
        child = self.create(
            label=label,
            kind=kind,
            attributes=attributes,
            requirements=combined,
            actor=actor,
        )
        child.parent_ids = [parent.id for parent in parents]
        self._record(child, "composed", actor, {"parent_ids": child.parent_ids})
        return child

    def evaluate(
        self, unit_id: str, facts: Mapping[str, Any], actor: str = "system"
    ) -> NXUnit:
        unit = self.get(unit_id)
        self._validate_actor(actor)
        self._require_active(unit)
        if unit.state == NXState.REALIZED:
            raise NXStateError("A realised unit cannot be re-evaluated.")
        if not isinstance(facts, Mapping):
            raise NXValidationError("Facts must be a mapping.")
        failures: list[dict[str, Any]] = []
        for requirement in unit.requirements:
            actual = self._read_path(facts, requirement.path)
            if not self._matches(actual, requirement):
                failures.append({
                    "path": requirement.path,
                    "operator": requirement.operator,
                })
        unit.state = NXState.ELIGIBLE if not failures else NXState.POTENTIAL
        self._record(
            unit,
            "evaluated",
            actor,
            {"passed": not failures, "failures": failures},
        )
        return unit

    def realize(self, unit_id: str, actor: str) -> NXUnit:
        unit = self.get(unit_id)
        if not isinstance(actor, str) or not actor.strip():
            raise NXValidationError("Realisation requires a non-empty actor.")
        if unit.state != NXState.ELIGIBLE:
            raise NXStateError("Only an eligible unit can be realised.")
        unit.state = NXState.REALIZED
        self._record(unit, "realized", actor, {})
        return unit

    def archive(self, unit_id: str, actor: str = "system") -> NXUnit:
        unit = self.get(unit_id)
        self._validate_actor(actor)
        if unit.state == NXState.ARCHIVED:
            raise NXStateError("Unit is already archived.")
        unit.state = NXState.ARCHIVED
        self._record(unit, "archived", actor, {})
        return unit

    def save(self, path: str | Path) -> None:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "format": self.FORMAT_VERSION,
            "units": [self._unit_to_dict(unit) for unit in self._units.values()],
        }
        destination.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    @classmethod
    def load(cls, path: str | Path) -> "NexistEngine":
        source = Path(path)
        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise NXValidationError(f"Could not read NEXIST data: {exc}") from exc
        if payload.get("format") != cls.FORMAT_VERSION:
            raise NXValidationError("Unsupported NEXIST file format.")
        engine = cls()
        for item in payload.get("units", []):
            unit = cls._unit_from_dict(item)
            if unit.id in engine._units:
                raise NXValidationError(f"Duplicate NX Unit ID: {unit.id}")
            engine._units[unit.id] = unit
        return engine

    @staticmethod
    def _read_path(facts: Mapping[str, Any], path: str) -> Any:
        current: Any = facts
        for part in path.split("."):
            if not isinstance(current, Mapping) or part not in current:
                return _MISSING
            current = current[part]
        return current

    @staticmethod
    def _matches(actual: Any, requirement: Requirement) -> bool:
        operator = requirement.operator
        expected = requirement.expected
        if operator == "exists":
            return actual is not _MISSING
        if actual is _MISSING:
            return operator == "ne"
        try:
            if operator == "eq":
                return actual == expected
            if operator == "ne":
                return actual != expected
            if operator == "gt":
                return actual > expected
            if operator == "gte":
                return actual >= expected
            if operator == "lt":
                return actual < expected
            if operator == "lte":
                return actual <= expected
            if operator == "in":
                return actual in expected
            if operator == "contains":
                return expected in actual
        except (TypeError, ValueError):
            return False
        return False

    @staticmethod
    def _require_active(unit: NXUnit) -> None:
        if unit.state == NXState.ARCHIVED:
            raise NXStateError("Archived units cannot be used in this operation.")

    @staticmethod
    def _validate_actor(actor: str) -> None:
        if not isinstance(actor, str) or not actor.strip():
            raise NXValidationError("Actor must be a non-empty string.")

    @staticmethod
    def _record(
        unit: NXUnit, event_type: str, actor: str, details: dict[str, Any]
    ) -> None:
        NexistEngine._validate_actor(actor)
        unit.events.append(NXEvent(event_type, actor=actor.strip(), details=details))

    @staticmethod
    def _unit_to_dict(unit: NXUnit) -> dict[str, Any]:
        return {
            "id": unit.id,
            "label": unit.label,
            "kind": unit.kind,
            "state": unit.state.value,
            "attributes": unit.attributes,
            "requirements": [
                {"path": req.path, "operator": req.operator, "expected": req.expected}
                for req in unit.requirements
            ],
            "relations": [
                {"target_id": rel.target_id, "relation": rel.relation}
                for rel in unit.relations
            ],
            "parent_ids": unit.parent_ids,
            "events": [
                {
                    "event_type": event.event_type,
                    "timestamp": event.timestamp,
                    "actor": event.actor,
                    "details": event.details,
                }
                for event in unit.events
            ],
        }

    @staticmethod
    def _unit_from_dict(data: Mapping[str, Any]) -> NXUnit:
        try:
            return NXUnit(
                id=data["id"],
                label=data["label"],
                kind=data["kind"],
                state=NXState(data["state"]),
                attributes=dict(data.get("attributes", {})),
                requirements=[
                    Requirement(**item) for item in data.get("requirements", [])
                ],
                relations=[
                    NXRelation(**item) for item in data.get("relations", [])
                ],
                parent_ids=list(data.get("parent_ids", [])),
                events=[NXEvent(**item) for item in data.get("events", [])],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise NXValidationError(f"Invalid NX Unit record: {exc}") from exc


class _Missing:
    pass


_MISSING = _Missing()
