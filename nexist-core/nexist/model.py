"""Core data types for the NEXIST experimental data model."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping
from uuid import uuid4


class NXState(str, Enum):
    POTENTIAL = "potential"
    ELIGIBLE = "eligible"
    REALIZED = "realized"
    ARCHIVED = "archived"


class NXError(Exception):
    """Base exception for NEXIST errors."""


class NXNotFoundError(NXError):
    """Raised when an NX Unit cannot be found."""


class NXStateError(NXError):
    """Raised when a requested lifecycle transition is invalid."""


class NXValidationError(NXError):
    """Raised when supplied data is invalid."""


SUPPORTED_OPERATORS = frozenset(
    {"eq", "ne", "gt", "gte", "lt", "lte", "exists", "in", "contains"}
)


@dataclass(frozen=True)
class Requirement:
    path: str
    operator: str
    expected: Any = None

    def __post_init__(self) -> None:
        if not isinstance(self.path, str) or not self.path.strip():
            raise NXValidationError("Requirement path must be a non-empty string.")
        if self.operator not in SUPPORTED_OPERATORS:
            raise NXValidationError(f"Unsupported requirement operator: {self.operator}")


@dataclass
class NXRelation:
    target_id: str
    relation: str


@dataclass
class NXEvent:
    event_type: str
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    actor: str = "system"
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class NXUnit:
    id: str
    label: str
    kind: str
    state: NXState = NXState.POTENTIAL
    attributes: dict[str, Any] = field(default_factory=dict)
    requirements: list[Requirement] = field(default_factory=list)
    relations: list[NXRelation] = field(default_factory=list)
    parent_ids: list[str] = field(default_factory=list)
    events: list[NXEvent] = field(default_factory=list)

    @classmethod
    def new(
        cls,
        label: str,
        kind: str,
        attributes: Mapping[str, Any] | None = None,
        requirements: list[Requirement] | None = None,
    ) -> "NXUnit":
        return cls(
            id=f"nx_{uuid4().hex}",
            label=label,
            kind=kind,
            attributes=dict(attributes or {}),
            requirements=list(requirements or []),
        )
