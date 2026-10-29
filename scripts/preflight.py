"""Run the CI release checks locally, including a uniquely named disposable browser stack.

Usage: python scripts/preflight.py
Requires uv, Node 22.12+, Docker and Chromium (npx playwright install chromium).
Never uses or resets the preserved permaculture-verify project.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

from check_versions import check_versions

ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], directory: str = "", env: dict[str, str] | None = None) -> None:
    executable = shutil.which(command[0])
    if executable is None:
        raise SystemExit(f"Required executable not found: {command[0]}")
    print(f"[{directory or 'root'}] {' '.join(command)}", flush=True)
    subprocess.run([executable, *command[1:]], cwd=ROOT / directory, env=env, check=True)


def main() -> None:
    check_versions(ROOT)
    run(["uv", "sync", "--locked"], "backend")
    for command in (
        ["ruff", "check", "."],
        ["ruff", "format", "--check", "."],
        ["mypy", "app"],
        ["python", "scripts/check_architecture.py"],
        ["python", "scripts/generate_frontend_contracts.py", "--check"],
        ["pytest"],
    ):
        run(["uv", "run", *command], "backend")
    run(["npm", "ci"], "frontend")
    run(["npm", "audit", "--audit-level=high"], "frontend")
    for script in ("lint", "typecheck", "unused", "test", "build"):
        run(["npm", "run", script], "frontend")
    project = f"permaculture-preflight-{uuid.uuid4().hex[:10]}"
    compose = [
        "docker",
        "compose",
        "-p",
        project,
        "-f",
        "infra/docker-compose.yml",
        "-f",
        "infra/docker-compose.preflight.yml",
    ]
    env = {
        **os.environ,
        "APP_SECRET_KEY": "disposable-preflight-secret-01234567890123456789",
        "POSTGRES_PASSWORD": "disposable-preflight-password",
        "APP_COOKIE_SECURE": "false",
        "APP_LOGIN_RATE_LIMIT_ATTEMPTS": "100",
        "E2E": "1",
        "CI": "1",
        "E2E_BASE_URL": "http://localhost:28080",
    }
    env.update(
        dict.fromkeys(
            (
                "APP_SMTP_HOST",
                "APP_SMTP_USERNAME",
                "APP_SMTP_PASSWORD",
                "APP_SMTP_FROM",
                "APP_PUBLIC_ORIGIN",
            ),
            "",
        )
    )
    try:
        run([*compose, "up", "--build", "-d", "--wait"], env=env)
        run(["npm", "run", "e2e", "--", "--project=chromium"], "frontend", env)
    except subprocess.CalledProcessError:
        run([*compose, "logs", "--no-color"], env=env)
        raise
    finally:
        # The UUID project was created by this invocation, never a user's existing stack.
        run([*compose, "down", "-v"], env=env)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
