"""Train a tiny NEXIST variational quantum classifier.

Run from this directory with: python -m examples.quantum_neural
All training labels below are illustrative human-supplied examples.
"""
from nexist import QuantumNeuralNetwork, QuantumTrainingExample


def main():
    examples = [
        QuantumTrainingExample((0.90, 0.85, 0.80, 0.90), 1),
        QuantumTrainingExample((0.80, 0.70, 0.75, 0.65), 1),
        QuantumTrainingExample((0.10, 0.20, 0.15, 0.25), 0),
        QuantumTrainingExample((0.25, 0.30, 0.20, 0.10), 0),
        QuantumTrainingExample((0.75, 0.60, 0.55, 0.80), 1),
        QuantumTrainingExample((0.15, 0.35, 0.25, 0.20), 0),
    ]
    model = QuantumNeuralNetwork(qubits=4, layers=2, seed=17)
    summary = model.fit(examples, epochs=120, learning_rate=0.08)

    print("Backend:", "NEXIST local state-vector QNN")
    print("Circuit: 4 feature-encoded qubits, 2 trainable entangling layers")
    print("Training:", summary)
    prediction = model.predict((0.82, 0.72, 0.70, 0.85))
    print("Suitability probability:", round(prediction.probability_suitable, 4))
    print("Pauli-Z readout:", tuple(round(x, 4) for x in prediction.pauli_z_expectations))
    print("Physical quantum hardware:", False)
    print("Model snapshot:", model.to_dict())


if __name__ == "__main__":
    main()
