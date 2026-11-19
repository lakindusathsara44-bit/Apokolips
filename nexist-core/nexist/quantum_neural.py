"""Variational quantum neural classifier for the NEXIST research prototype.

The model encodes bounded numeric features into a state vector, applies
trainable single-qubit rotations and entangling CNOT gates, and reads
Pauli-Z expectation values. Training uses the parameter-shift rule. The
state-vector simulator and classical optimizer run on an ordinary CPU;
this is not a physical quantum processor or evidence of quantum advantage.
"""
from __future__ import annotations

import cmath
import math
import random
from dataclasses import dataclass
from typing import Sequence

from .model import NXValidationError


@dataclass(frozen=True)
class QuantumTrainingExample:
    """One user-labelled example with one bounded feature per qubit."""

    features: tuple[float, ...]
    label: int

    def __post_init__(self) -> None:
        if not isinstance(self.features, tuple) or not self.features:
            raise NXValidationError("Training features must be a non-empty tuple.")
        for index, value in enumerate(self.features):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise NXValidationError(f"Feature {index} must be numeric.")
            if not math.isfinite(float(value)) or not 0.0 <= float(value) <= 1.0:
                raise NXValidationError(f"Feature {index} must be finite and in [0, 1].")
        if isinstance(self.label, bool) or self.label not in (0, 1):
            raise NXValidationError("Training label must be integer 0 or 1.")


@dataclass(frozen=True)
class QuantumPrediction:
    """A binary suitability probability and its measured quantum features."""

    probability_suitable: float
    predicted_label: int
    pauli_z_expectations: tuple[float, ...]


class QuantumNeuralNetwork:
    """Small variational quantum classifier with parameter-shift training.

    This is an experimental, supervised classifier. It learns only from
    labelled examples supplied by the caller; it is not a general-purpose
    language model. Each feature is angle-encoded on one qubit.
    """

    FORMAT_VERSION = "nexist-qnn-1"
    MIN_QUBITS = 2
    MAX_QUBITS = 8
    MAX_LAYERS = 3
    MAX_TRAINING_EXAMPLES = 256

    def __init__(self, qubits: int = 4, layers: int = 2, seed: int = 17):
        if isinstance(qubits, bool) or not isinstance(qubits, int) or not self.MIN_QUBITS <= qubits <= self.MAX_QUBITS:
            raise NXValidationError(f"qubits must be an integer from {self.MIN_QUBITS} to {self.MAX_QUBITS}.")
        if isinstance(layers, bool) or not isinstance(layers, int) or not 1 <= layers <= self.MAX_LAYERS:
            raise NXValidationError(f"layers must be an integer from 1 to {self.MAX_LAYERS}.")
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise NXValidationError("seed must be an integer.")
        self.qubits = qubits
        self.layers = layers
        rng = random.Random(seed)
        self.theta = [rng.uniform(-0.2, 0.2) for _ in range(layers * qubits * 2)]
        self.readout_weights = [rng.uniform(-0.1, 0.1) for _ in range(qubits)]
        self.bias = 0.0
        self.training_summary: dict[str, float | int] | None = None

    def predict(self, features: Sequence[float]) -> QuantumPrediction:
        clean = self._validate_features(features)
        expectations = self._expectations(clean, self.theta)
        probability = self._sigmoid(
            self.bias + math.fsum(
                weight * value
                for weight, value in zip(self.readout_weights, expectations)
            )
        )
        return QuantumPrediction(
            probability_suitable=probability,
            predicted_label=int(probability >= 0.5),
            pauli_z_expectations=tuple(expectations),
        )

    def fit(
        self,
        examples: Sequence[QuantumTrainingExample],
        *,
        epochs: int = 120,
        learning_rate: float = 0.08,
    ) -> dict[str, float | int]:
        """Train with cross-entropy and parameter-shift circuit gradients."""
        items = tuple(examples)
        if not 4 <= len(items) <= self.MAX_TRAINING_EXAMPLES:
            raise NXValidationError(
                f"Provide between 4 and {self.MAX_TRAINING_EXAMPLES} labelled examples."
            )
        if any(not isinstance(item, QuantumTrainingExample) for item in items):
            raise NXValidationError("Every training item must be a QuantumTrainingExample.")
        if {item.label for item in items} != {0, 1}:
            raise NXValidationError("Training examples must contain both labels 0 and 1.")
        clean = [(self._validate_features(item.features), item.label) for item in items]
        if isinstance(epochs, bool) or not isinstance(epochs, int) or not 1 <= epochs <= 500:
            raise NXValidationError("epochs must be an integer from 1 to 500.")
        if isinstance(learning_rate, bool) or not isinstance(learning_rate, (int, float)):
            raise NXValidationError("learning_rate must be numeric.")
        if not math.isfinite(float(learning_rate)) or not 0.0001 <= learning_rate <= 1.0:
            raise NXValidationError("learning_rate must be finite and in [0.0001, 1.0].")

        initial_loss = self._loss(clean)
        for _ in range(epochs):
            theta_grad = [0.0] * len(self.theta)
            weight_grad = [0.0] * self.qubits
            bias_grad = 0.0

            for features, label in clean:
                expectations = self._expectations(features, self.theta)
                probability = self._sigmoid(
                    self.bias + math.fsum(
                        weight * value
                        for weight, value in zip(self.readout_weights, expectations)
                    )
                )
                error = probability - label
                bias_grad += error
                for qubit in range(self.qubits):
                    weight_grad[qubit] += error * expectations[qubit]

                # Every variational parameter occurs in exactly one rotation,
                # so the two-shift identity is exact for its expectation.
                for parameter_index in range(len(self.theta)):
                    plus = list(self.theta)
                    minus = list(self.theta)
                    plus[parameter_index] += math.pi / 2.0
                    minus[parameter_index] -= math.pi / 2.0
                    exp_plus = self._expectations(features, plus)
                    exp_minus = self._expectations(features, minus)
                    derivative_logit = math.fsum(
                        self.readout_weights[q] * 0.5 * (exp_plus[q] - exp_minus[q])
                        for q in range(self.qubits)
                    )
                    theta_grad[parameter_index] += error * derivative_logit

            scale = 1.0 / len(clean)
            rate = float(learning_rate)
            self.bias -= rate * self._clip(bias_grad * scale)
            self.readout_weights = [
                weight - rate * self._clip(gradient * scale)
                for weight, gradient in zip(self.readout_weights, weight_grad)
            ]
            self.theta = [
                self._wrap_angle(angle - rate * self._clip(gradient * scale))
                for angle, gradient in zip(self.theta, theta_grad)
            ]

        final_loss = self._loss(clean)
        accuracy = sum(
            self.predict(features).predicted_label == label
            for features, label in clean
        ) / len(clean)
        self.training_summary = {
            "examples": len(clean),
            "epochs": epochs,
            "initial_loss": initial_loss,
            "final_loss": final_loss,
            "accuracy": accuracy,
        }
        return dict(self.training_summary)

    def to_dict(self) -> dict:
        """Return a JSON-safe model snapshot."""
        return {
            "format": self.FORMAT_VERSION,
            "qubits": self.qubits,
            "layers": self.layers,
            "theta": list(self.theta),
            "readout_weights": list(self.readout_weights),
            "bias": self.bias,
            "training_summary": dict(self.training_summary) if self.training_summary else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "QuantumNeuralNetwork":
        """Restore a validated model snapshot."""
        if not isinstance(data, dict) or data.get("format") != cls.FORMAT_VERSION:
            raise NXValidationError("Unsupported quantum neural model format.")
        model = cls(qubits=data.get("qubits"), layers=data.get("layers"), seed=17)
        theta = data.get("theta")
        weights = data.get("readout_weights")
        bias = data.get("bias")
        if (
            not isinstance(theta, list) or len(theta) != len(model.theta)
            or not isinstance(weights, list) or len(weights) != model.qubits
        ):
            raise NXValidationError("Quantum neural model parameter dimensions are invalid.")
        values = theta + weights + [bias]
        if any(
            isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            for value in values
        ):
            raise NXValidationError("Quantum neural model parameters must be finite numbers.")
        model.theta = [float(value) for value in theta]
        model.readout_weights = [float(value) for value in weights]
        model.bias = float(bias)
        summary = data.get("training_summary")
        if summary is not None:
            if not isinstance(summary, dict):
                raise NXValidationError("Training summary must be an object or null.")
            model.training_summary = dict(summary)
        return model

    def _loss(self, examples: Sequence[tuple[tuple[float, ...], int]]) -> float:
        epsilon = 1e-12
        losses = []
        for features, label in examples:
            probability = self.predict(features).probability_suitable
            probability = min(1.0 - epsilon, max(epsilon, probability))
            losses.append(
                -label * math.log(probability)
                -(1 - label) * math.log(1.0 - probability)
            )
        return math.fsum(losses) / len(losses)

    def _expectations(self, features: Sequence[float], theta: Sequence[float]) -> list[float]:
        state = [0j] * (1 << self.qubits)
        state[0] = 1.0 + 0j

        # Data re-uploading: feature-dependent RY and RZ rotations.
        for qubit, value in enumerate(features):
            self._apply_ry(state, qubit, math.pi * value)
            self._apply_rz(state, qubit, math.pi * (value - 0.5))

        parameter = 0
        for _layer in range(self.layers):
            for qubit in range(self.qubits):
                self._apply_ry(state, qubit, theta[parameter])
                self._apply_rz(state, qubit, theta[parameter + 1])
                parameter += 2
            for qubit in range(self.qubits - 1):
                self._apply_cnot(state, qubit, qubit + 1)
            if self.qubits > 2:
                self._apply_cnot(state, self.qubits - 1, 0)

        expectations = []
        for qubit in range(self.qubits):
            bit = 1 << qubit
            expectation = 0.0
            for basis, amplitude in enumerate(state):
                probability = amplitude.real * amplitude.real + amplitude.imag * amplitude.imag
                expectation += probability if not basis & bit else -probability
            expectations.append(max(-1.0, min(1.0, expectation)))
        return expectations

    def _validate_features(self, features: Sequence[float]) -> tuple[float, ...]:
        if isinstance(features, (str, bytes)) or not isinstance(features, Sequence):
            raise NXValidationError("Features must be a numeric sequence.")
        if len(features) != self.qubits:
            raise NXValidationError(f"Expected exactly {self.qubits} features.")
        clean = []
        for index, value in enumerate(features):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise NXValidationError(f"Feature {index} must be numeric.")
            number = float(value)
            if not math.isfinite(number) or not 0.0 <= number <= 1.0:
                raise NXValidationError(f"Feature {index} must be finite and in [0, 1].")
            clean.append(number)
        return tuple(clean)

    @staticmethod
    def _apply_ry(state: list[complex], qubit: int, angle: float) -> None:
        bit = 1 << qubit
        cosine = math.cos(angle / 2.0)
        sine = math.sin(angle / 2.0)
        for index in range(len(state)):
            if index & bit:
                continue
            zero, one = state[index], state[index | bit]
            state[index] = cosine * zero - sine * one
            state[index | bit] = sine * zero + cosine * one

    @staticmethod
    def _apply_rz(state: list[complex], qubit: int, angle: float) -> None:
        bit = 1 << qubit
        zero_phase = cmath.exp(-0.5j * angle)
        one_phase = cmath.exp(0.5j * angle)
        for index in range(len(state)):
            state[index] *= one_phase if index & bit else zero_phase

    @staticmethod
    def _apply_cnot(state: list[complex], control: int, target: int) -> None:
        control_bit = 1 << control
        target_bit = 1 << target
        for index in range(len(state)):
            if index & control_bit and not index & target_bit:
                other = index | target_bit
                state[index], state[other] = state[other], state[index]

    @staticmethod
    def _sigmoid(value: float) -> float:
        if value >= 0:
            return 1.0 / (1.0 + math.exp(-min(value, 700.0)))
        exp_value = math.exp(max(value, -700.0))
        return exp_value / (1.0 + exp_value)

    @staticmethod
    def _clip(value: float, limit: float = 5.0) -> float:
        return max(-limit, min(limit, value))

    @staticmethod
    def _wrap_angle(value: float) -> float:
        return (value + math.pi) % (2.0 * math.pi) - math.pi
