"""Enforce private module boundaries and framework-free services without importing the app."""

from __future__ import annotations

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
# Explicit DI composition roots are the only cross-module private imports allowed.
PRIVATE_IMPORTS = {
    ("modules/planning/dependencies.py", "app.modules.sites.repository"),
}


def violations(app: Path = APP) -> list[str]:
    errors = []
    for path in sorted(app.rglob("*.py")):
        relative = path.relative_to(app)
        if "tests" in relative.parts or "migrations" in relative.parts:
            continue
        own = relative.parts[1] if relative.parts[0] == "modules" else None
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if node.level:
                    package = ["app", *relative.parts[:-1]]
                    base = package[: len(package) - node.level + 1]
                    module = ".".join([*base, *([module] if module else [])])
                names = [module]
                # Also catch `from app.modules.other import models`.
                names += [f"{module}.{item.name}" for item in node.names]
            elif isinstance(node, ast.Import):
                names = [item.name for item in node.names]
            else:
                continue
            for name in names:
                parts = name.split(".")
                if path.name == "service.py" and (parts[0] == "fastapi" or "router" in parts):
                    errors.append(f"{relative}:{node.lineno}: service imports {name}")
                if (
                    len(parts) >= 4
                    and parts[:2] == ["app", "modules"]
                    and own
                    and parts[2] != own
                    and parts[3] in {"repository", "models"}
                ):
                    imported = ".".join(parts[:4])
                    if (relative.as_posix(), imported) not in PRIVATE_IMPORTS:
                        errors.append(f"{relative}:{node.lineno}: private import {imported}")
    return sorted(set(errors))


if __name__ == "__main__":
    errors = violations()
    if errors:
        raise SystemExit("\n".join(errors))
    print("Module boundaries passed")
