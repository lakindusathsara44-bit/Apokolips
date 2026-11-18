"""NEXIST experimental NX data model and hybrid Q-Intelligence extension."""
from .engine import NexistEngine
from .evidence import (
    AuthorizationStatus,
    CheckStatus,
    EvidenceAwareEngine,
    EvidenceCheck,
    EvidenceEvaluation,
    EvidenceStatus,
    EvaluationOutcome,
    NXEvidence,
    RealizationAuthorization,
)
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
from .qintelligence import (
    EvidenceBackedQAOAResult,
    NexistQIntelligence,
    QAOAResult,
    SelectionCandidate,
    solve_selection,
)

__all__ = [
    "NexistEngine",
    "EvidenceAwareEngine",
    "NexistQIntelligence",
    "SelectionCandidate",
    "QAOAResult",
    "EvidenceBackedQAOAResult",
    "solve_selection",
    "NXEvidence",
    "EvidenceCheck",
    "EvidenceEvaluation",
    "RealizationAuthorization",
    "EvidenceStatus",
    "CheckStatus",
    "EvaluationOutcome",
    "AuthorizationStatus",
    "NXError",
    "NXEvent",
    "NXNotFoundError",
    "NXRelation",
    "NXState",
    "NXStateError",
    "NXUnit",
    "NXValidationError",
    "Requirement",
]

__version__ = "0.4.0"
