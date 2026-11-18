"""Optional Qiskit Aer sampler for a NEXIST QAOA p=1 selection problem.

Install the optional dependency set before importing this module:
    pip install qiskit qiskit-aer
The default NEXIST engine remains dependency-free.
"""
from __future__ import annotations

import math
from typing import Iterable, Sequence

from .model import NXValidationError
from .qintelligence import SelectionCandidate, _prepare_problem


def sample_with_qiskit_aer(
    candidates: Sequence[SelectionCandidate],
    budget: float,
    gamma: float,
    beta: float,
    *,
    dependencies: Iterable[tuple[str, str]] = (),
    conflicts: Iterable[tuple[str, str]] = (),
    shots: int = 1024,
    seed: int = 17,
) -> dict:
    """Sample the p=1 QAOA circuit with the optional Qiskit Aer simulator."""
    if not all(math.isfinite(float(value)) for value in (gamma, beta)):
        raise NXValidationError("QAOA gamma and beta must be finite numbers.")
    if isinstance(shots, bool) or not isinstance(shots, int) or not 32 <= shots <= 10000:
        raise NXValidationError("shots must be an integer from 32 to 10000.")
    problem = _prepare_problem(candidates, budget, dependencies, conflicts)
    try:
        from qiskit import QuantumCircuit, transpile
        from qiskit_aer import AerSimulator
    except ImportError as exc:
        raise RuntimeError(
            "Qiskit Aer is optional. Install it with: pip install qiskit qiskit-aer"
        ) from exc

    scale = max((abs(value) for value in problem.scores), default=1.0) or 1.0
    diagonal_phases = [
        complex(math.cos(gamma * score / scale), math.sin(gamma * score / scale))
        for score in problem.scores
    ]
    circuit = QuantumCircuit(len(problem.candidates))
    circuit.h(range(len(problem.candidates)))
    circuit.diagonal(diagonal_phases, list(range(len(problem.candidates))))
    for qubit in range(len(problem.candidates)):
        circuit.rx(2.0 * beta, qubit)
    circuit.measure_all()

    backend = AerSimulator()
    compiled = transpile(circuit, backend, seed_transpiler=seed)
    counts = backend.run(compiled, shots=shots, seed_simulator=seed).result().get_counts()
    samples = []
    for raw_bits, count in counts.items():
        bit_string = raw_bits.replace(" ", "")
        mask = int(bit_string[::-1], 2)
        selected = tuple(problem.candidates[i].unit_id
                         for i in range(len(problem.candidates)) if mask & (1 << i))
        samples.append({
            "bitstring": bit_string,
            "count": int(count),
            "selected_unit_ids": list(selected),
            "score": problem.scores[mask],
            "resource_cost": problem.resource_costs[mask],
            "benefit": problem.benefits[mask],
            "feasible": problem.feasible[mask],
        })
    samples.sort(key=lambda row: (row["score"], row["count"]), reverse=True)
    best = samples[0]
    return {
        "backend": "qiskit-aer-simulator",
        "shots": shots,
        "qubits_used": len(problem.candidates),
        "best_sample": best,
        "samples": samples[:10],
        "circuit_depth": int(compiled.depth()),
        "circuit_operations": dict(compiled.count_ops()),
        "physical_quantum_hardware": False,
        "notes": [
            "This is Qiskit Aer local simulation, not a physical quantum processor.",
            "Use the state-vector NEXIST solver to estimate gamma and beta, or supply a research-chosen parameter pair.",
        ],
    }
