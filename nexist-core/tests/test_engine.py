import tempfile
import unittest
from pathlib import Path

from nexist import (
    NexistEngine,
    NXState,
    NXStateError,
    NXValidationError,
    Requirement,
)


class NexistEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = NexistEngine()

    def test_new_unit_starts_potential(self):
        unit = self.engine.create("Research Lab", "facility")
        self.assertEqual(unit.state, NXState.POTENTIAL)

    def test_requirement_pass_makes_unit_eligible(self):
        unit = self.engine.create(
            "Research Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        self.engine.evaluate(unit.id, {"resources": 12})
        self.assertEqual(unit.state, NXState.ELIGIBLE)

    def test_requirement_failure_keeps_unit_potential(self):
        unit = self.engine.create(
            "Research Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        self.engine.evaluate(unit.id, {"resources": 4})
        self.assertEqual(unit.state, NXState.POTENTIAL)

    def test_realize_requires_eligibility(self):
        unit = self.engine.create("Research Lab", "facility")
        with self.assertRaises(NXStateError):
            self.engine.realize(unit.id, "tester")

    def test_realize_is_explicit(self):
        unit = self.engine.create(
            "Research Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        self.engine.evaluate(unit.id, {"resources": 10})
        self.assertEqual(unit.state, NXState.ELIGIBLE)
        self.engine.realize(unit.id, "tester")
        self.assertEqual(unit.state, NXState.REALIZED)

    def test_nested_fact_path(self):
        unit = self.engine.create(
            "Lab", "facility",
            requirements=[Requirement("site.capacity", "gt", 5)],
        )
        self.engine.evaluate(unit.id, {"site": {"capacity": 8}})
        self.assertEqual(unit.state, NXState.ELIGIBLE)

    def test_missing_fact_path_fails_exists(self):
        unit = self.engine.create(
            "Lab", "facility",
            requirements=[Requirement("site.capacity", "exists")],
        )
        self.engine.evaluate(unit.id, {"site": {}})
        self.assertEqual(unit.state, NXState.POTENTIAL)

    def test_incompatible_comparison_fails_safely(self):
        unit = self.engine.create(
            "Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        self.engine.evaluate(unit.id, {"resources": "many"})
        self.assertEqual(unit.state, NXState.POTENTIAL)

    def test_link_records_relationship(self):
        first = self.engine.create("A", "concept")
        second = self.engine.create("B", "concept")
        self.engine.link(first.id, second.id, "depends_on")
        self.assertEqual(first.relations[0].target_id, second.id)

    def test_compose_inherits_requirements_and_lineage(self):
        first = self.engine.create(
            "A", "concept", requirements=[Requirement("x", "eq", 1)]
        )
        second = self.engine.create(
            "B", "concept", requirements=[Requirement("y", "eq", 2)]
        )
        child = self.engine.compose([first.id, second.id], "A+B")
        self.assertEqual(child.parent_ids, [first.id, second.id])
        self.assertEqual(len(child.requirements), 2)
        self.assertEqual(child.state, NXState.POTENTIAL)

    def test_archive_blocks_further_linking(self):
        first = self.engine.create("A", "concept")
        second = self.engine.create("B", "concept")
        self.engine.archive(first.id)
        with self.assertRaises(NXStateError):
            self.engine.link(first.id, second.id, "related_to")

    def test_json_round_trip(self):
        unit = self.engine.create(
            "Research Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "nexist.json"
            self.engine.save(path)
            loaded = NexistEngine.load(path)
        restored = loaded.get(unit.id)
        self.assertEqual(restored.label, unit.label)
        self.assertEqual(restored.requirements[0].expected, 10)

    def test_invalid_requirement_is_rejected(self):
        with self.assertRaises(NXValidationError):
            Requirement("resources", "execute", 10)


if __name__ == "__main__":
    unittest.main()
