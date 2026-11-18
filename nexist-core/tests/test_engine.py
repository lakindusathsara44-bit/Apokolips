import math
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
        evaluated = self.engine.evaluate(unit.id, {"resources": 12})
        self.assertEqual(evaluated.state, NXState.ELIGIBLE)
        self.assertEqual(self.engine.get(unit.id).state, NXState.ELIGIBLE)

    def test_requirement_failure_keeps_unit_potential(self):
        unit = self.engine.create(
            "Research Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        evaluated = self.engine.evaluate(unit.id, {"resources": 4})
        self.assertEqual(evaluated.state, NXState.POTENTIAL)
        self.assertEqual(self.engine.get(unit.id).state, NXState.POTENTIAL)

    def test_realize_requires_eligibility(self):
        unit = self.engine.create("Research Lab", "facility")
        with self.assertRaises(NXStateError):
            self.engine.realize(unit.id, "tester")

    def test_realize_is_explicit(self):
        unit = self.engine.create(
            "Research Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        evaluated = self.engine.evaluate(unit.id, {"resources": 10})
        self.assertEqual(evaluated.state, NXState.ELIGIBLE)
        realized = self.engine.realize(unit.id, "tester")
        self.assertEqual(realized.state, NXState.REALIZED)
        self.assertEqual(self.engine.get(unit.id).state, NXState.REALIZED)

    def test_nested_fact_path(self):
        unit = self.engine.create(
            "Lab", "facility",
            requirements=[Requirement("site.capacity", "gt", 5)],
        )
        evaluated = self.engine.evaluate(unit.id, {"site": {"capacity": 8}})
        self.assertEqual(evaluated.state, NXState.ELIGIBLE)

    def test_missing_fact_path_fails_exists(self):
        unit = self.engine.create(
            "Lab", "facility",
            requirements=[Requirement("site.capacity", "exists")],
        )
        evaluated = self.engine.evaluate(unit.id, {"site": {}})
        self.assertEqual(evaluated.state, NXState.POTENTIAL)

    def test_incompatible_comparison_fails_safely(self):
        unit = self.engine.create(
            "Lab", "facility",
            requirements=[Requirement("resources", "gte", 10)],
        )
        evaluated = self.engine.evaluate(unit.id, {"resources": "many"})
        self.assertEqual(evaluated.state, NXState.POTENTIAL)

    def test_link_records_relationship(self):
        first = self.engine.create("A", "concept")
        second = self.engine.create("B", "concept")
        linked = self.engine.link(first.id, second.id, "depends_on")
        self.assertEqual(linked.relations[0].target_id, second.id)
        self.assertEqual(self.engine.get(first.id).relations[0].target_id, second.id)

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

    def test_returned_units_are_detached_snapshots(self):
        unit = self.engine.create("Snapshot test", "concept", attributes={"nested": {"value": 1}})
        unit.state = NXState.REALIZED
        unit.attributes["nested"]["value"] = 999
        fetched = self.engine.get(unit.id)
        self.assertEqual(fetched.state, NXState.POTENTIAL)
        self.assertEqual(fetched.attributes["nested"]["value"], 1)

    def test_list_units_filters(self):
        a = self.engine.create("A", "concept")
        self.engine.create("B", "facility")
        self.assertEqual(len(self.engine.list_units(kind="concept")), 1)
        self.assertEqual(len(self.engine.list_units(state="potential")), 2)
        snapshots = self.engine.list_units()
        snapshots[0].label = "changed outside the engine"
        self.assertEqual(self.engine.get(a.id).label, "A")

    def test_boolean_is_not_equal_to_integer(self):
        self.assertFalse(NexistEngine._matches(True, Requirement("x", "eq", 1)))
        unit = self.engine.create("Boolean check", "concept",
                                  requirements=[Requirement("x", "gte", 1)])
        self.assertEqual(self.engine.evaluate(unit.id, {"x": True}).state, NXState.POTENTIAL)

    def test_requirement_paths_reject_empty_segments(self):
        for path in (".x", "x.", "x..y", " x"):
            with self.subTest(path=path), self.assertRaises(NXValidationError):
                Requirement(path, "eq", 1)

    def test_json_numbers_compare_without_boolean_coercion(self):
        self.assertTrue(NexistEngine._matches(1.0, Requirement("x", "eq", 1)))
        self.assertFalse(NexistEngine._matches(True, Requirement("x", "eq", 1)))

    def test_non_json_and_non_finite_values_are_rejected(self):
        with self.assertRaises(NXValidationError):
            self.engine.create("Bad", "concept", attributes={"value": object()})
        with self.assertRaises(NXValidationError):
            self.engine.create("Bad", "concept", attributes={"value": math.nan})
        unit = self.engine.create("Facts", "concept")
        with self.assertRaises(NXValidationError):
            self.engine.evaluate(unit.id, {"value": math.inf})

    def test_compose_rejects_non_list_parent_ids_cleanly(self):
        with self.assertRaises(NXValidationError):
            self.engine.compose("not-a-list", "Invalid composition")

    def test_load_rejects_missing_relation_targets(self):
        import json
        record = {
            "id": "nx_a", "label": "A", "kind": "concept", "state": "potential",
            "attributes": {}, "requirements": [],
            "relations": [{"target_id": "nx_missing", "relation": "related"}],
            "parent_ids": [], "events": [],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "broken-reference.json"
            path.write_text(json.dumps({"format": NexistEngine.FORMAT_VERSION, "units": [record]}),
                            encoding="utf-8")
            with self.assertRaises(NXValidationError):
                NexistEngine.load(path)


if __name__ == "__main__":
    unittest.main()
