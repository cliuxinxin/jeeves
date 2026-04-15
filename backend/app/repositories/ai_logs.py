from __future__ import annotations

import json
import sqlite3

from ..database import get_connection
from ..graph_contracts import get_node_label
from ..schemas import AILogRecord, AILogStatus


def _row_to_record(row: sqlite3.Row) -> AILogRecord:
    payload = dict(row)
    payload["input_messages"] = json.loads(payload.get("input_messages") or "[]")
    node_name = payload.get("node_name")
    payload["node_label"] = get_node_label(node_name) if isinstance(node_name, str) else None
    return AILogRecord.model_validate(payload)


def create_ai_log(
    *,
    request_id: str,
    conversation_id: int | None,
    conversation_title: str | None,
    graph_config_id: int | None,
    graph_config_name: str | None,
    node_name: str | None,
    operation: str | None,
    llm_source: str | None,
    llm_config_name: str | None,
    model: str | None,
    status: AILogStatus,
    attempt_count: int,
    duration_ms: float,
    input_messages: list[dict[str, str]],
    response_text: str | None,
    error_message: str | None,
) -> AILogRecord:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO ai_logs (
                request_id,
                conversation_id,
                conversation_title,
                graph_config_id,
                graph_config_name,
                node_name,
                operation,
                llm_source,
                llm_config_name,
                model,
                status,
                attempt_count,
                duration_ms,
                input_messages,
                response_text,
                error_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                conversation_id,
                conversation_title,
                graph_config_id,
                graph_config_name,
                node_name,
                operation,
                llm_source,
                llm_config_name,
                model,
                status.value,
                attempt_count,
                duration_ms,
                json.dumps(input_messages, ensure_ascii=False),
                response_text,
                error_message,
            ),
        )
        row = connection.execute(
            "SELECT * FROM ai_logs WHERE id = ?",
            (int(cursor.lastrowid),),
        ).fetchone()

    if row is None:
        raise RuntimeError("AI log could not be created.")
    return _row_to_record(row)


def list_ai_logs(
    *,
    conversation_id: int | None = None,
    request_id: str | None = None,
    status: AILogStatus | None = None,
    node_name: str | None = None,
    graph_config_id: int | None = None,
    limit: int = 50,
) -> list[AILogRecord]:
    where_clauses: list[str] = []
    values: list[object] = []

    if conversation_id is not None:
        where_clauses.append("conversation_id = ?")
        values.append(conversation_id)
    if request_id:
        where_clauses.append("request_id = ?")
        values.append(request_id)
    if status is not None:
        where_clauses.append("status = ?")
        values.append(status.value)
    if node_name:
        where_clauses.append("node_name = ?")
        values.append(node_name)
    if graph_config_id is not None:
        where_clauses.append("graph_config_id = ?")
        values.append(graph_config_id)

    safe_limit = max(1, min(limit, 200))
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM ai_logs
            {where_sql}
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (*values, safe_limit),
        ).fetchall()

    return [_row_to_record(row) for row in rows]
