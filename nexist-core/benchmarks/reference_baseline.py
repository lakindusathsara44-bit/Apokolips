"""Independent conventional Python reference model for NEXIST comparisons.

This module intentionally implements the same valid-input scenario semantics
using ordinary dataclasses, dictionaries, and helper functions. It is not
intended as a general-purpose library or a security boundary.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4


_MISSING = object()
_FORMAT = "nexist-0.2"


@dataclass
class BaselineUnit:
    id: str
    label: str
    kind: str
    state: str = "potential"
    attributes: dict[str, Any] = field(default_factory=dict)
    requirements: list[dict[str, Any]] = field(default_factory=list)
    relations: list[dict[str, str]] = field(default_factory=list)
    parent_ids: list[str] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)


class ReferenceBaseline:
    """Conventional implementation of the workload's NEXIST-like semantics."""

    def __init__(self) -> None:
        self._units: dict[str, BaselineUnit] = {}

    def create(
        self,
        label: str,
        kind: str,
        attributes: Mapping[str, Any] | None = None,
        requirements: list[dict[str, Any]] | None = None,
        actor: str = "system",
    ) -> BaselineUnit:
        unit = BaselineUnit(
            id=f"ref_{uuid4().hex}",
            label=label,
            kind=kind,
            attributes=copy.deepcopy(dict(attributes or {})),
            requirements=copy.deepcopy(list(requirements or [])),
        )
        self._record(unit, "created", actor, {"label": label, "kind": kind})
        self._units[unit.id] = unit
        return copy.deepcopy(unit)

    def get(self, unit_id: str) -> BaselineUnit:
        return copy.deepcopy(self._units[unit_id])

    def list_units(self) -> list[BaselineUnit]:
        return [copy.deepcopy(unit) for unit in self._units.values()]

    def link(
        self, source_id: str, target_id: str, relation: str, actor: str = "system"
    ) -> BaselineUnit:
        source = self._units[source_id]
        target = self._units[target_id]
        if source.state == "archived" or target.state == "archived":
            raise ValueError("Archived units cannot be linked.")
        source.relations.append({"target_id": target.id, "relation": relation})
        self._record(source, "linked", actor, {
            "target_id": target.id, "relation": relation
        })
        return copy.deepcopy(source)

    def compose(
        self,
        parent_ids: list[str],
        label: str,
        kind: str = "composite",
        attributes: Mapping[str, Any] | None = None,
        requirements: list[dict[str, Any]] | None = None,
        actor: str = "system",
    ) -> BaselineUnit:
        if len(parent_ids) < 2 or len(set(parent_ids)) != len(parent_ids):
            raise ValueError("Composition requires at least two unique parents.")
        parents = [self._units[parent_id] for parent_id in parent_ids]
        if any(parent.state == "archived" for parent in parents):
            raise ValueError("Archived units cannot be composition parents.")
        inherited = [
            copy.deepcopy(requirement)
            for parent in parents
            for requirement in parent.requirements
        ]
        child = self.create(
            label,
            kind,
            attributes,
            inherited + copy.deepcopy(list(requirements or [])),
            actor,
        )
        stored = self._units[child.id]
        stored.parent_ids = list(parent_ids)
        self._record(stored, "composed", actor, {"parent_ids": list(parent_ids)})
        return copy.deepcopy(stored)

    def evaluate(
        self, unit_id: str, facts: Mapping[str, Any], actor: str = "system"
    ) -> BaselineUnit:
        unit = self._units[unit_id]
        if unit.state == "archived" or unit.state == "realized":
            raise ValueError("This unit cannot be evaluated in its current state.")
        passed = all(
            self._matches(self._read_path(facts, item["path"]), item)
            for item in unit.requirements
        )
        unit.state = "eligible" if passed else "potential"
        self._record(unit, "evaluated", actor, {"passed": passed, "failures": [] if passed else [
            {"path": item["path"], "operator": item["operator"]}
            for item in unit.requirements
            if not self._matches(self._read_path(facts, item["path"]), item)
        ]})
        return copy.deepcopy(unit)

    def realize(self, unit_id: str, actor: str) -> BaselineUnit:
        unit = self._units[unit_id]
        if unit.state != "eligible":
            raise ValueError("Only an eligible unit can be realised.")
        unit.state = "realized"
        self._record(unit, "realized", actor, {})
        return copy.deepcopy(unit)

    def archive(self, unit_id: str, actor: str = "system") -> BaselineUnit:
        unit = self._units[unit_id]
        if unit.state == "archived":
            raise ValueError("Unit is already archived.")
        unit.state = "archived"
        self._record(unit, "archived", actor, {})
        return copy.deepcopy(unit)

    def save(self, path: str | Path) -> None:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        encoded = json.dumps({
            "format": _FORMAT,
            "units": [asdict(unit) for unit in self._units.values()],
        }, indent=2, ensure_ascii=False, allow_nan=False)
        temporary_name = None
        try:
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
        finally:
            if temporary_name and os.path.exists(temporary_name):
                os.unlink(temporary_name)

    @classmethod
    def load(cls, path: str | Path) -> "ReferenceBaseline":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if data.get("format") != _FORMAT:
            raise ValueError("Unsupported reference snapshot version.")
        engine = cls()
        for item in data["units"]:
            record = BaselineUnit(**item)
            if record.id in engine._units:
                raise ValueError(f"Duplicate unit ID: {record.id}")
            engine._units[record.id] = record
        known = set(engine._units)
        for unit in engine._units.values():
            if any(edge["target_id"] not in known for edge in unit.relations):
                raise ValueError("Unknown relationship target.")
            if any(parent not in known for parent in unit.parent_ids):
                raise ValueError("Unknown composition parent.")
        return engine

    @staticmethod
    def _record(
        unit: BaselineUnit, event_type: str, actor: str, details: dict[str, Any]
    ) -> None:
        unit.events.append({
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor": actor,
            "details": copy.deepcopy(details),
        })

    @staticmethod
    def _read_path(facts: Mapping[str, Any], path: str) -> Any:
        value: Any = facts
        for part in path.split("."):
            if not isinstance(value, Mapping) or part not in value:
                return _MISSING
            value = value[part]
        return value

    @staticmethod
    def _json_equal(left: Any, right: Any) -> bool:
        if isinstance(left, bool) or isinstance(right, bool):
            return isinstance(left, bool) and isinstance(right, bool) and left == right
        if isinstance(left, (int, float)) and isinstance(right, (int, float)):
            return left == right
        if type(left) is not type(right):
            return False
        if isinstance(left, list):
            return len(left) == len(right) and all(
                ReferenceBaseline._json_equal(a, b) for a, b in zip(left, right)
            )
        if isinstance(left, dict):
            return left.keys() == right.keys() and all(
                ReferenceBaseline._json_equal(left[key], right[key]) for key in left
            )
        return left == right

    @staticmethod
    def _matches(actual: Any, requirement: dict[str, Any]) -> bool:
        operator, expected = requirement["operator"], requirement.get("expected")
        if operator == "exists":
            return actual is not _MISSING
        if actual is _MISSING:
            return operator == "ne"
        if operator in {"eq", "ne"}:
            equal = ReferenceBaseline._json_equal(actual, expected)
            return equal if operator == "eq" else not equal
        if operator in {"gt", "gte", "lt", "lte"}:
            if (
                isinstance(actual, bool) or isinstance(expected, bool)
                or not isinstance(actual, (int, float))
                or not isinstance(expected, (int, float))
            ):
                return False
            return {
                "gt": actual > expected, "gte": actual >= expected,
                "lt": actual < expected, "lte": actual <= expected,
            }[operator]
        if operator == "in":
            if isinstance(expected, list):
                return any(ReferenceBaseline._json_equal(actual, x) for x in expected)
            if isinstance(expected, str):
                return isinstance(actual, str) and actual in expected
            if isinstance(expected, dict):
                return isinstance(actual, str) and actual in expected
            return False
        if operator == "contains":
            if isinstance(actual, list):
                return any(ReferenceBaseline._json_equal(expected, x) for x in actual)
            if isinstance(actual, str):
                return isinstance(expected, str) and expected in actual
            if isinstance(actual, dict):
                return isinstance(expected, str) and expected in actual
        return False


class NexistAdapter:
    """Adapts the NEXIST API to the independent benchmark workload contract."""

    def __init__(self, engine=None) -> None:
        from nexist import NexistEngine
        self.engine = engine or NexistEngine()

    @classmethod
    def load(cls, path: str | Path) -> "NexistAdapter":
        from nexist import NexistEngine
        return cls(NexistEngine.load(path))

    def create(self, label, kind, attributes=None, requirements=None, actor="system"):
        from nexist import Requirement
        declared = [Requirement(**item) for item in (requirements or [])]
        return self.engine.create(label, kind, attributes, declared, actor)

    def get(self, unit_id):
        return self.engine.get(unit_id)

    def list_units(self):
        return self.engine.list_units()

    def link(self, source_id, target_id, relation, actor="system"):
        return self.engine.link(source_id, target_id, relation, actor)

    def compose(self, parent_ids, label, kind="composite", attributes=None, requirements=None, actor="system"):
        from nexist import Requirement
        declared = [Requirement(**item) for item in (requirements or [])]
        return self.engine.compose(parent_ids, label, kind, attributes, declared, actor)

    def evaluate(self, unit_id, facts, actor="system"):
        return self.engine.evaluate(unit_id, facts, actor)

    def realize(self, unit_id, actor):
        return self.engine.realize(unit_id, actor)

    def archive(self, unit_id, actor="system"):
        return self.engine.archive(unit_id, actor)

    def save(self, path):
        return self.engine.save(path)


def make_requirement(path: str, operator: str, expected: Any) -> dict[str, Any]:
    return {"path": path, "operator": operator, "expected": expected}
