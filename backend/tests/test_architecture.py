"""Architecture rules reject both import spellings and keep DI exceptions narrow."""

from pathlib import Path

from scripts.check_architecture import violations


def test_boundaries_reject_private_imports_and_framework_services(tmp_path: Path) -> None:
    service = tmp_path / "modules" / "example" / "service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "import fastapi\n"
        "from app.modules.sites import models\n"
        "import app.modules.auth.repository\n"
        "from ..terrain import repository\n"
        "from app.modules.planning.service import PlanningService\n",
        encoding="utf-8",
    )
    errors = violations(tmp_path)
    assert len(errors) == 4
    assert any("fastapi" in error for error in errors)
    assert any("sites.models" in error for error in errors)
    assert any("auth.repository" in error for error in errors)


def test_application_boundaries() -> None:
    assert violations() == []
