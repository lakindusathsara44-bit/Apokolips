"""In-memory NEXIST engine with declarative requirement evaluation."""
from __future__ import annotations

import copy
import json
import os
import tempfile
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
    FORMAT_VERSION = "nexist-0.2"

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
        clean_attributes = copy.deepcopy(dict(attributes or {}))
        clean_requirements = copy.deepcopy(reqs)
        unit = NXUnit.new(label.strip(), kind.strip(), clean_attributes, clean_requirements)
        self._record(unit, "created", actor, {"label": unit.label, "kind": unit.kind})
        self._units[unit.id] = unit
        return self._snapshot(unit)

    def get(self, unit_id: str) -> NXUnit:
        """Return a detached snapshot; mutations must go through engine methods."""
        return self._snapshot(self._get_internal(unit_id))

    def list_units(
        self, *, state: NXState | str | None = None, kind: str | None = None
    ) -> list[NXUnit]:
        """Return detached snapshots, optionally filtered by lifecycle state or kind."""
        selected_state = None
        if state is not None:
            try:
                selected_state = state if isinstance(state, NXState) else NXState(state)
            except (TypeError, ValueError) as exc:
                raise NXValidationError(f"Unknown NX state: {state!r}") from exc
        if kind is not None and (not isinstance(kind, str) or not kind.strip()):
            raise NXValidationError("Unit kind must be a non-empty string.")
        return [
            self._snapshot(unit)
            for unit in self._units.values()
            if (selected_state is None or unit.state == selected_state)
            and (kind is None or unit.kind == kind)
        ]

    def link(
        self, source_id: str, target_id: str, relation: str, actor: str = "system"
    ) -> NXUnit:
        source = self._get_internal(source_id)
        target = self._get_internal(target_id)
        self._validate_actor(actor)
        self._require_active(source)
        self._require_active(target)
        if not isinstance(relation, str) or not relation.strip():
            raise NXValidationError("Relation name must be a non-empty string.")
        source.relations.append(NXRelation(target.id, relation.strip()))
        self._record(source, "linked", actor, {
            "target_id": target.id, "relation": relation.strip()
        })
        return self._snapshot(source)

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
        if not isinstance(parent_ids, list) or any(not isinstance(item, str) or not item for item in parent_ids):
            raise NXValidationError("Parent IDs must be a list of non-empty strings.")
        parents = [self._get_internal(parent_id) for parent_id in parent_ids]
        for parent in parents:
            self._require_active(parent)
        inherited = [
            requirement
            for parent in parents
            for requirement in parent.requirements
        ]
        combined = inherited + list(requirements or [])
        child_snapshot = self.create(
            label=label,
            kind=kind,
            attributes=attributes,
            requirements=combined,
            actor=actor,
        )
        child = self._get_internal(child_snapshot.id)
        child.parent_ids = [parent.id for parent in parents]
        self._record(child, "composed", actor, {"parent_ids": list(child.parent_ids)})
        return self._snapshot(child)

    def evaluate(
        self, unit_id: str, facts: Mapping[str, Any], actor: str = "system"
    ) -> NXUnit:
        unit = self._get_internal(unit_id)
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
        return self._snapshot(unit)

    def realize(self, unit_id: str, actor: str) -> NXUnit:
        unit = self._get_internal(unit_id)
        if not isinstance(actor, str) or not actor.strip():
            raise NXValidationError("Realisation requires a non-empty actor.")
        if unit.state != NXState.ELIGIBLE:
            raise NXStateError("Only an eligible unit can be realised.")
        unit.state = NXState.REALIZED
        self._record(unit, "realized", actor, {})
        return self._snapshot(unit)

    def archive(self, unit_id: str, actor: str = "system") -> NXUnit:
        unit = self._get_internal(unit_id)
        self._validate_actor(actor)
        if unit.state == NXState.ARCHIVED:
            raise NXStateError("Unit is already archived.")
        unit.state = NXState.ARCHIVED
        self._record(unit, "archived", actor, {})
        return self._snapshot(unit)

    def save(self, path: str | Path) -> None:
        """Atomically write a versioned UTF-8 JSON snapshot."""
        destination = Path(path)
        temporary_name = None
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "format": self.FORMAT_VERSION,
                "units": [self._unit_to_dict(unit) for unit in self._units.values()],
            }
            encoded = json.dumps(
                payload, indent=2, ensure_ascii=False, allow_nan=False
            )
            with tempfile.NamedTemporaryFile(
                "w", encoding="utf-8", dir=destination.parent,
                prefix=f".{destination.name}.", suffix=".tmp", delete=False
            ) as handle:
                temporary_name = handle.name
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, destination)
            temporary_name = None
        except (OSError, TypeError, ValueError) as exc:
            raise NXValidationError(f"Could not save NEXIST data: {exc}") from exc
        finally:
            if temporary_name and os.path.exists(temporary_name):
                os.unlink(temporary_name)

    @classmethod
    def load(cls, path: str | Path) -> "NexistEngine":
        source = Path(path)
        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise NXValidationError(f"Could not read NEXIST data: {exc}") from exc
        if not isinstance(payload, dict):
            raise NXValidationError("NEXIST file root must be a JSON object.")
        if payload.get("format") not in {cls.FORMAT_VERSION, "nexist-0.1"}:
            raise NXValidationError("Unsupported NEXIST file format.")
        records = payload.get("units")
        if not isinstance(records, list):
            raise NXValidationError("NEXIST file 'units' value must be a list.")
        engine = cls()
        for item in records:
            unit = cls._unit_from_dict(item)
            if unit.id in engine._units:
                raise NXValidationError(f"Duplicate NX Unit ID: {unit.id}")
            engine._units[unit.id] = unit
        engine._validate_references()
        return engine

    def _get_internal(self, unit_id: str) -> NXUnit:
        if not isinstance(unit_id, str) or not unit_id:
            raise NXNotFoundError(f"NX Unit not found: {unit_id!r}")
        try:
            return self._units[unit_id]
        except KeyError as exc:
            raise NXNotFoundError(f"NX Unit not found: {unit_id}") from exc

    @staticmethod
    def _snapshot(unit: NXUnit) -> NXUnit:
        return copy.deepcopy(unit)

    def _validate_references(self) -> None:
        known_ids = set(self._units)
        for unit in self._units.values():
            if len(set(unit.parent_ids)) != len(unit.parent_ids):
                raise NXValidationError(f"Duplicate parent IDs in NX Unit {unit.id}.")
            if unit.id in unit.parent_ids:
                raise NXValidationError(f"NX Unit {unit.id} cannot be its own parent.")
            if len(unit.parent_ids) == 1:
                raise NXValidationError(f"NX Unit {unit.id} must have zero or at least two parents.")
            for parent_id in unit.parent_ids:
                if parent_id not in known_ids:
                    raise NXValidationError(f"Unknown parent ID in NX Unit {unit.id}: {parent_id}")
            for relation in unit.relations:
                if relation.target_id not in known_ids:
                    raise NXValidationError(
                        f"Unknown relation target in NX Unit {unit.id}: {relation.target_id}"
                    )

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
            if operator in {"eq", "ne"}:
                equal = (type(actual) is type(expected) and actual == expected)
                return equal if operator == "eq" else not equal
            if operator in {"gt", "gte", "lt", "lte"}:
                if (
                    isinstance(actual, bool) or isinstance(expected, bool)
                    or not isinstance(actual, (int, float))
                    or not isinstance(expected, (int, float))
                ):
                    return False
                return {
                    "gt": actual > expected,
                    "gte": actual >= expected,
                    "lt": actual < expected,
                    "lte": actual <= expected,
                }[operator]
            if operator == "in":
                if isinstance(expected, list):
                    return any(type(actual) is type(item) and actual == item for item in expected)
                if isinstance(expected, str):
                    return isinstance(actual, str) and actual in expected
                if isinstance(expected, dict):
                    return isinstance(actual, str) and actual in expected
                return False
            if operator == "contains":
                if isinstance(actual, list):
                    return any(type(expected) is type(item) and expected == item for item in actual)
                if isinstance(actual, str):
                    return isinstance(expected, str) and expected in actual
                if isinstance(actual, dict):
                    return isinstance(expected, str) and expected in actual
                return False
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
        unit.events.append(
            NXEvent(
                event_type,
                actor=actor.strip(),
                details=copy.deepcopy(details),
            )
        )

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
