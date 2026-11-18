"""Small end-to-end NEXIST example.

Run from the nexist-core directory with:
    python -m examples.quickstart
"""
from pathlib import Path
from tempfile import TemporaryDirectory

from nexist import NexistEngine, Requirement


def main() -> None:
    engine = NexistEngine()
    lab = engine.create(
        label="Future Research Lab",
        kind="facility",
        attributes={"region": "north", "purpose": "research"},
        requirements=[Requirement("resources", "gte", 10)],
        actor="demo",
    )

    evaluated = engine.evaluate(lab.id, facts={"resources": 12}, actor="demo")
    print(f"After evaluation: {evaluated.state.value}")

    realised = engine.realize(lab.id, actor="demo")
    print(f"After explicit realisation: {realised.state.value}")

    with TemporaryDirectory() as folder:
        save_path = Path(folder) / "nexist.json"
        engine.save(save_path)
        restored = NexistEngine.load(save_path)
        print(f"Saved and loaded: {restored.get(lab.id).label}")


if __name__ == "__main__":
    main()
