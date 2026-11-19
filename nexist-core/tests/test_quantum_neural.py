import math
import unittest

from nexist import NXValidationError, QuantumNeuralNetwork, QuantumTrainingExample


class QuantumNeuralNetworkTests(unittest.TestCase):
    def setUp(self):
        self.examples = [
            QuantumTrainingExample((0.90, 0.85, 0.80, 0.90), 1),
            QuantumTrainingExample((0.80, 0.70, 0.75, 0.65), 1),
            QuantumTrainingExample((0.10, 0.20, 0.15, 0.25), 0),
            QuantumTrainingExample((0.25, 0.30, 0.20, 0.10), 0),
        ]

    def test_quantum_state_readout_is_bounded(self):
        model = QuantumNeuralNetwork(qubits=4, layers=2, seed=5)
        prediction = model.predict((0.8, 0.5, 0.6, 0.3))
        self.assertGreaterEqual(prediction.probability_suitable, 0.0)
        self.assertLessEqual(prediction.probability_suitable, 1.0)
        self.assertEqual(len(prediction.pauli_z_expectations), 4)
        for value in prediction.pauli_z_expectations:
            self.assertTrue(math.isfinite(value))
            self.assertGreaterEqual(value, -1.0)
            self.assertLessEqual(value, 1.0)

    def test_parameter_shift_training_and_model_round_trip(self):
        model = QuantumNeuralNetwork(seed=17)
        before = model.predict((0.9, 0.8, 0.8, 0.9)).probability_suitable
        summary = model.fit(self.examples, epochs=40, learning_rate=0.08)
        after = model.predict((0.9, 0.8, 0.8, 0.9)).probability_suitable
        self.assertEqual(summary["examples"], 4)
        self.assertEqual(summary["epochs"], 40)
        self.assertLess(summary["final_loss"], summary["initial_loss"])
        self.assertTrue(math.isfinite(summary["final_loss"]))
        self.assertNotEqual(before, after)
        restored = QuantumNeuralNetwork.from_dict(model.to_dict())
        self.assertAlmostEqual(
            restored.predict((0.9, 0.8, 0.8, 0.9)).probability_suitable,
            after,
            places=12,
        )

    def test_training_requires_both_classes_and_bounded_features(self):
        model = QuantumNeuralNetwork()
        with self.assertRaises(NXValidationError):
            model.fit([
                QuantumTrainingExample((0.1, 0.2, 0.3, 0.4), 1),
                QuantumTrainingExample((0.2, 0.3, 0.4, 0.5), 1),
                QuantumTrainingExample((0.3, 0.4, 0.5, 0.6), 1),
                QuantumTrainingExample((0.4, 0.5, 0.6, 0.7), 1),
            ])
        with self.assertRaises(NXValidationError):
            model.predict((0.1, 0.2, 0.3))
        with self.assertRaises(NXValidationError):
            QuantumTrainingExample((0.1, 1.2, 0.3, 0.4), 0)

    def test_invalid_model_snapshot_is_rejected(self):
        with self.assertRaises(NXValidationError):
            QuantumNeuralNetwork.from_dict({"format": "unknown"})


if __name__ == "__main__":
    unittest.main()
