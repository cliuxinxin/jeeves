from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

from fastapi import Request, Response

LOGGER_NAME = "jeeves"


def configure_logging() -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


logger = configure_logging()


def log_event(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=False, default=str))


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def attach_request_id(request: Request) -> str:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    return request_id


async def log_request_lifecycle(request: Request, call_next) -> Response:
    request_id = attach_request_id(request)
    started_at = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        log_event(
            "http_request_failed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            duration_ms=duration_ms,
        )
        raise

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    log_event(
        "http_request_completed",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
    )
    return response
