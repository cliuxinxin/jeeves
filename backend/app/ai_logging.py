from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from typing import Iterator


@dataclass(frozen=True)
class AILogContext:
    request_id: str = ""
    conversation_id: int | None = None
    conversation_title: str | None = None
    graph_config_id: int | None = None
    graph_config_name: str | None = None
    node_name: str | None = None
    operation: str | None = None


_UNSET = object()
_AI_LOG_CONTEXT: ContextVar[AILogContext | None] = ContextVar(
    "ai_log_context",
    default=None,
)


def get_ai_log_context() -> AILogContext:
    return _AI_LOG_CONTEXT.get() or AILogContext()


@contextmanager
def ai_log_scope(
    *,
    request_id: str | object = _UNSET,
    conversation_id: int | None | object = _UNSET,
    conversation_title: str | None | object = _UNSET,
    graph_config_id: int | None | object = _UNSET,
    graph_config_name: str | None | object = _UNSET,
    node_name: str | None | object = _UNSET,
    operation: str | None | object = _UNSET,
) -> Iterator[AILogContext]:
    current = get_ai_log_context()
    updates: dict[str, object] = {}

    if request_id is not _UNSET:
        updates["request_id"] = request_id
    if conversation_id is not _UNSET:
        updates["conversation_id"] = conversation_id
    if conversation_title is not _UNSET:
        updates["conversation_title"] = conversation_title
    if graph_config_id is not _UNSET:
        updates["graph_config_id"] = graph_config_id
    if graph_config_name is not _UNSET:
        updates["graph_config_name"] = graph_config_name
    if node_name is not _UNSET:
        updates["node_name"] = node_name
    if operation is not _UNSET:
        updates["operation"] = operation

    token = _AI_LOG_CONTEXT.set(replace(current, **updates))
    try:
        yield get_ai_log_context()
    finally:
        _AI_LOG_CONTEXT.reset(token)
