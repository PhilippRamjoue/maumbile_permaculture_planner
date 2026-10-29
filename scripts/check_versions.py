"""Keep source versions aligned; release builds stamp both images from their tag."""

import json
import tomllib
from pathlib import Path


def check_versions(root: Path) -> None:
    backend = tomllib.loads((root / "backend/pyproject.toml").read_text(encoding="utf-8"))
    frontend = json.loads((root / "frontend/package.json").read_text(encoding="utf-8"))
    if backend["project"]["version"] != frontend["version"]:
        raise SystemExit("Backend and frontend source versions must match before release")


if __name__ == "__main__":
    check_versions(Path(__file__).resolve().parents[1])
    print("Source versions match")
