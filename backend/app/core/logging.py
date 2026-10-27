"""Structured logging and a request-id middleware."""

from __future__ import annotations

import logging
import re
import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"
# Orchestrator probes hit these every few seconds; logging them would drown real traffic.
_QUIET_PATHS = frozenset({"/healthz", "/readyz"})

access_log = structlog.get_logger("app.access")


def safe_request_path(path: str) -> str:
    """Bearer share secrets must never be copied to diagnostics."""
    return re.sub(r"(/(?:api/v1/)?shared/)[^/]+", r"\1[redacted]", path)


def configure_logging(debug: bool = False) -> None:
    """Configure structlog to emit JSON (or a console renderer in debug)."""
    logging.basicConfig(format="%(message)s", level=logging.DEBUG if debug else logging.INFO)
    renderer = structlog.dev.ConsoleRenderer() if debug else structlog.processors.JSONRenderer()
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if debug else logging.INFO
        ),
        cache_logger_on_first_use=True,
    )


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a request id to each request, echo it in the response header, log one line each."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            access_log.exception(
                "request_failed",
                method=request.method,
                path=safe_request_path(request.url.path),
                status=500,
            )
            raise
        else:
            if request.url.path not in _QUIET_PATHS or response.status_code >= 400:
                access_log.info(
                    "request",
                    method=request.method,
                    path=safe_request_path(request.url.path),
                    status=response.status_code,
                    duration_ms=round((time.perf_counter() - started) * 1000, 1),
                )
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
