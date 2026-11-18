import tempfile
import unittest
from pathlib import Path

from benchmarks.equivalent_workload import summarise, workload
from benchmarks.reference_baseline import NexistAdapter, ReferenceBaseline


class ComparativeResearchTests(unittest.TestCase):
    def _run(self, factory):
        with tempfile.TemporaryDirectory() as directory:
            engine = factory()
            return workload(engine, 24, Path(directory) / "snapshot.json")

    def test_nexist_and_reference_baseline_have_same_semantic_summary(self):
        self.assertEqual(
            self._run(NexistAdapter),
            self._run(ReferenceBaseline),
        )

    def test_reference_snapshots_do_not_mutate_internal_units(self):
        engine = ReferenceBaseline()
        created = engine.create("A", "concept")
        created.state = "realized"
        self.assertEqual(engine.get(created.id).state, "potential")

    def test_summary_is_stable_for_same_workload(self):
        first = self._run(NexistAdapter)
        second = self._run(NexistAdapter)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
