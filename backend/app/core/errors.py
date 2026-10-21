"""RFC 7807 problem+json error handling."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_MEDIA_TYPE = "application/problem+json"


def problem(
    status: int,
    title: str,
    detail: str | None = None,
    type_: str = "about:blank",
    **extra: Any,
) -> JSONResponse:
    body: dict[str, Any] = {"type": type_, "title": title, "status": status}
    if detail is not None:
        body["detail"] = detail
    body.update(extra)
    return JSONResponse(status_code=status, content=body, media_type=PROBLEM_MEDIA_TYPE)


async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return problem(status=exc.status_code, title=str(exc.detail))


async def _validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return problem(
        status=422,
        title="Validation error",
        detail="The request did not pass validation.",
        errors=jsonable_encoder(exc.errors()),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)  # type: ignore[arg-type]
