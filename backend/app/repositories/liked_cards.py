from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..database import get_connection
from ..graph_contracts import get_node_label
from ..graph_prompt_values import resolve_prompt_values
from ..prompt_compiler import build_graph_prompt_previews
from ..schemas import GraphType, LikedCardRecord


class LikedCardNotFoundError(Exception):
    pass


class LikedCardSourceNotFoundError(Exception):
    pass


def _loads_dict(raw_value: object) -> dict[str, Any]:
    if not isinstance(raw_value, str) or not raw_value.strip():
        return {}

    try:
        loaded = json.loads(raw_value)
    except json.JSONDecodeError:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _loads_list(raw_value: object) -> list[Any]:
    if not isinstance(raw_value, str) or not raw_value.strip():
        return []

    try:
        loaded = json.loads(raw_value)
    except json.JSONDecodeError:
        return []
    return loaded if isinstance(loaded, list) else []


def _row_to_record(row: sqlite3.Row) -> LikedCardRecord:
    payload = dict(row)
    payload["source_state_patch"] = _loads_dict(payload.get("source_state_patch"))
    payload["workflow_snapshot"] = _loads_dict(payload.get("workflow_snapshot"))
    return LikedCardRecord.model_validate(payload)


def _find_source_log(
    connection: sqlite3.Connection,
    *,
    conversation_id: int,
    source_node_name: str | None,
    source_content: str,
) -> sqlite3.Row | None:
    if source_node_name:
        row = connection.execute(
            """
            SELECT *
            FROM ai_logs
            WHERE conversation_id = ?
              AND node_name = ?
              AND operation = 'graph_node'
              AND status = 'success'
              AND request_id != ''
              AND TRIM(COALESCE(response_text, '')) = TRIM(?)
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (conversation_id, source_node_name, source_content),
        ).fetchone()
        if row is not None:
            return row

    return connection.execute(
        """
        SELECT *
        FROM ai_logs
        WHERE conversation_id = ?
          AND operation = 'graph_node'
          AND request_id != ''
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (conversation_id,),
    ).fetchone()


def _serialize_ai_log(row: sqlite3.Row) -> dict[str, Any]:
    node_name = row["node_name"]
    return {
        "id": int(row["id"]),
        "request_id": row["request_id"],
        "node_name": node_name,
        "node_label": get_node_label(node_name) if isinstance(node_name, str) else None,
        "operation": row["operation"],
        "llm_source": row["llm_source"],
        "llm_config_name": row["llm_config_name"],
        "model": row["model"],
        "status": row["status"],
        "attempt_count": int(row["attempt_count"]),
        "duration_ms": float(row["duration_ms"]),
        "input_messages": _loads_list(row["input_messages"]),
        "response_text": row["response_text"],
        "error_message": row["error_message"],
        "created_at": row["created_at"],
    }


def _list_generation_logs(
    connection: sqlite3.Connection,
    *,
    conversation_id: int,
    request_id: str | None,
) -> list[dict[str, Any]]:
    if not request_id:
        return []

    rows = connection.execute(
        """
        SELECT *
        FROM ai_logs
        WHERE conversation_id = ?
          AND request_id = ?
          AND operation = 'graph_node'
        ORDER BY id ASC
        """,
        (conversation_id, request_id),
    ).fetchall()
    return [_serialize_ai_log(row) for row in rows]


def _resolve_graph_prompt_previews(source: sqlite3.Row) -> list[dict[str, Any]]:
    raw_graph_type = source["graph_type"]
    if not isinstance(raw_graph_type, str) or not raw_graph_type:
        return []

    try:
        graph_type = GraphType(raw_graph_type)
    except ValueError:
        return []

    raw_prompt_values = {
        str(key): str(value)
        for key, value in _loads_dict(source["prompt_values_json"]).items()
        if isinstance(key, str) and isinstance(value, str)
    }
    prompt_values = resolve_prompt_values(
        graph_type=graph_type,
        prompt_values=raw_prompt_values,
        system_prompt=source["system_prompt"] or "",
        analyzer_prompt=source["analyzer_prompt"] or "",
        deconstructor_prompt=source["deconstructor_prompt"] or "",
    )
    return [
        dict(item)
        for item in build_graph_prompt_previews(
            graph_type=graph_type,
            prompt_values=prompt_values,
        )
    ]


def _build_workflow_snapshot(
    connection: sqlite3.Connection,
    *,
    source: sqlite3.Row,
    source_log: sqlite3.Row | None,
) -> dict[str, Any]:
    source_state_patch = _loads_dict(source["state_patch"])
    request_id = str(source_log["request_id"]) if source_log is not None else None
    generation_logs = _list_generation_logs(
        connection,
        conversation_id=int(source["conversation_id"]),
        request_id=request_id,
    )

    return {
        "source_message": {
            "id": int(source["id"]),
            "node_name": source["node_name"],
            "node_label": source["node_label"],
            "created_at": source["created_at"],
            "state_patch": source_state_patch,
        },
        "conversation": {
            "id": int(source["conversation_id"]),
            "title": source["conversation_title"],
        },
        "graph_config": {
            "id": source["graph_config_id"],
            "name": source["graph_config_name"],
            "graph_type": source["graph_type"],
            "prompt_previews": _resolve_graph_prompt_previews(source),
        },
        "generation": {
            "request_id": request_id,
            "source_log_id": int(source_log["id"]) if source_log is not None else None,
            "logs": generation_logs,
        },
    }


def _get_liked_card_by_source(
    connection: sqlite3.Connection,
    *,
    source_message_id: int,
    card_index: int,
) -> LikedCardRecord:
    row = connection.execute(
        """
        SELECT
            liked_cards.id,
            liked_cards.conversation_id,
            conversations.title AS conversation_title,
            liked_cards.graph_config_id,
            liked_cards.graph_config_name,
            liked_cards.graph_type,
            liked_cards.source_message_id,
            liked_cards.source_request_id,
            liked_cards.source_node_name,
            liked_cards.source_node_label,
            liked_cards.source_state_patch,
            liked_cards.card_index,
            liked_cards.route_label,
            liked_cards.title,
            liked_cards.content,
            liked_cards.workflow_snapshot,
            liked_cards.created_at
        FROM liked_cards
        LEFT JOIN conversations ON conversations.id = liked_cards.conversation_id
        WHERE liked_cards.source_message_id = ?
          AND liked_cards.card_index = ?
        """,
        (source_message_id, card_index),
    ).fetchone()

    if row is None:
        raise LikedCardNotFoundError("Liked card was not found.")
    return _row_to_record(row)


def create_liked_card(
    *,
    conversation_id: int,
    source_message_id: int,
    card_index: int,
    route_label: str | None,
    title: str,
    content: str,
) -> LikedCardRecord:
    with get_connection() as connection:
        source = connection.execute(
            """
            SELECT
                conversation_messages.id,
                conversation_messages.conversation_id,
                conversation_messages.content,
                conversation_messages.node_name,
                conversation_messages.node_label,
                conversation_messages.state_patch,
                conversation_messages.created_at,
                conversations.title AS conversation_title,
                conversations.graph_config_id,
                graph_configs.name AS graph_config_name,
                graph_configs.graph_type,
                graph_configs.system_prompt,
                graph_configs.analyzer_prompt,
                graph_configs.deconstructor_prompt,
                graph_configs.prompt_values_json
            FROM conversation_messages
            JOIN conversations ON conversations.id = conversation_messages.conversation_id
            LEFT JOIN graph_configs ON graph_configs.id = conversations.graph_config_id
            WHERE conversation_messages.id = ?
              AND conversation_messages.role = 'assistant'
            """,
            (source_message_id,),
        ).fetchone()
        if source is None or int(source["conversation_id"]) != conversation_id:
            raise LikedCardSourceNotFoundError("Card source message was not found.")

        source_log = _find_source_log(
            connection,
            conversation_id=conversation_id,
            source_node_name=source["node_name"],
            source_content=source["content"],
        )
        source_request_id = str(source_log["request_id"]) if source_log is not None else None
        workflow_snapshot = _build_workflow_snapshot(
            connection,
            source=source,
            source_log=source_log,
        )

        connection.execute(
            """
            INSERT INTO liked_cards (
                conversation_id,
                graph_config_id,
                graph_config_name,
                graph_type,
                source_message_id,
                source_request_id,
                source_node_name,
                source_node_label,
                source_state_patch,
                card_index,
                route_label,
                title,
                content,
                workflow_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_message_id, card_index)
            DO UPDATE SET
                conversation_id = excluded.conversation_id,
                graph_config_id = excluded.graph_config_id,
                graph_config_name = excluded.graph_config_name,
                graph_type = excluded.graph_type,
                source_request_id = excluded.source_request_id,
                source_node_name = excluded.source_node_name,
                source_node_label = excluded.source_node_label,
                source_state_patch = excluded.source_state_patch,
                route_label = excluded.route_label,
                title = excluded.title,
                content = excluded.content,
                workflow_snapshot = excluded.workflow_snapshot
            """,
            (
                conversation_id,
                source["graph_config_id"],
                source["graph_config_name"],
                source["graph_type"],
                source_message_id,
                source_request_id,
                source["node_name"],
                source["node_label"],
                source["state_patch"],
                card_index,
                route_label,
                title,
                content,
                json.dumps(workflow_snapshot, ensure_ascii=False),
            ),
        )
        return _get_liked_card_by_source(
            connection,
            source_message_id=source_message_id,
            card_index=card_index,
        )


def list_liked_cards(
    *,
    conversation_id: int | None = None,
    limit: int = 100,
) -> list[LikedCardRecord]:
    where_clauses: list[str] = []
    values: list[object] = []

    if conversation_id is not None:
        where_clauses.append("liked_cards.conversation_id = ?")
        values.append(conversation_id)

    safe_limit = max(1, min(limit, 500))
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
                liked_cards.id,
                liked_cards.conversation_id,
                conversations.title AS conversation_title,
                liked_cards.graph_config_id,
                liked_cards.graph_config_name,
                liked_cards.graph_type,
                liked_cards.source_message_id,
                liked_cards.source_request_id,
                liked_cards.source_node_name,
                liked_cards.source_node_label,
                liked_cards.source_state_patch,
                liked_cards.card_index,
                liked_cards.route_label,
                liked_cards.title,
                liked_cards.content,
                liked_cards.workflow_snapshot,
                liked_cards.created_at
            FROM liked_cards
            LEFT JOIN conversations ON conversations.id = liked_cards.conversation_id
            {where_sql}
            ORDER BY liked_cards.created_at DESC, liked_cards.id DESC
            LIMIT ?
            """,
            (*values, safe_limit),
        ).fetchall()

    return [_row_to_record(row) for row in rows]


def delete_liked_card(liked_card_id: int) -> None:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM liked_cards WHERE id = ?",
            (liked_card_id,),
        )

    if cursor.rowcount == 0:
        raise LikedCardNotFoundError(f"Liked card {liked_card_id} was not found.")
