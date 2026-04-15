import json
import sqlite3

from ..database import get_connection
from ..graph_prompt_values import (
    merge_legacy_prompt_inputs,
    prompt_values_to_columns,
    resolve_prompt_values,
)
from ..schemas import (
    GraphConfigCreateRequest,
    GraphConfigRecord,
    GraphConfigUpdateRequest,
    GraphType,
)


class GraphConfigNotFoundError(Exception):
    pass


def _row_to_record(row: sqlite3.Row) -> GraphConfigRecord:
    payload = dict(row)
    payload["is_active"] = bool(payload["is_active"])
    raw_prompt_values = {}
    prompt_values_json = payload.pop("prompt_values_json", None)
    if isinstance(prompt_values_json, str) and prompt_values_json.strip():
        try:
            loaded = json.loads(prompt_values_json)
        except json.JSONDecodeError:
            loaded = {}
        if isinstance(loaded, dict):
            raw_prompt_values = {
                str(key): str(value)
                for key, value in loaded.items()
                if isinstance(key, str) and isinstance(value, str)
            }
    payload["prompt_values"] = resolve_prompt_values(
        graph_type=GraphType(payload["graph_type"]),
        prompt_values=raw_prompt_values,
        system_prompt=payload.get("system_prompt") or "",
        analyzer_prompt=payload.get("analyzer_prompt") or "",
        deconstructor_prompt=payload.get("deconstructor_prompt") or "",
    )
    return GraphConfigRecord.model_validate(payload)


def _fetch_config_row(connection: sqlite3.Connection, config_id: int) -> sqlite3.Row | None:
    return connection.execute("SELECT * FROM graph_configs WHERE id = ?", (config_id,)).fetchone()


def get_graph_config(config_id: int) -> GraphConfigRecord | None:
    with get_connection() as connection:
        row = _fetch_config_row(connection, config_id)
    return _row_to_record(row) if row else None


def list_graph_configs() -> list[GraphConfigRecord]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM graph_configs
            ORDER BY is_active DESC, updated_at DESC, id DESC
            """
        ).fetchall()
    return [_row_to_record(row) for row in rows]


def get_active_graph_config() -> GraphConfigRecord | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM graph_configs
            WHERE is_active = 1
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        ).fetchone()
    return _row_to_record(row) if row else None


def create_graph_config(payload: GraphConfigCreateRequest) -> GraphConfigRecord:
    prompt_values = resolve_prompt_values(
        graph_type=payload.graph_type,
        prompt_values=payload.prompt_values,
        system_prompt=payload.system_prompt,
        analyzer_prompt=payload.analyzer_prompt,
        deconstructor_prompt=payload.deconstructor_prompt,
    )
    legacy_prompt_values = merge_legacy_prompt_inputs(
        prompt_values=payload.prompt_values,
        system_prompt=payload.system_prompt,
        analyzer_prompt=payload.analyzer_prompt,
        deconstructor_prompt=payload.deconstructor_prompt,
    )
    system_prompt = legacy_prompt_values["system_prompt"]
    _, analyzer_prompt, deconstructor_prompt = prompt_values_to_columns(prompt_values)
    prompt_values_json = json.dumps(prompt_values, ensure_ascii=False, sort_keys=True)
    with get_connection() as connection:
        config_count = connection.execute("SELECT COUNT(*) FROM graph_configs").fetchone()[0]
        cursor = connection.execute(
            """
            INSERT INTO graph_configs (
                name,
                graph_type,
                system_prompt,
                analyzer_prompt,
                deconstructor_prompt,
                prompt_values_json,
                is_active,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                payload.name,
                payload.graph_type.value,
                system_prompt,
                analyzer_prompt,
                deconstructor_prompt,
                prompt_values_json,
                1 if config_count == 0 else 0,
            ),
        )
        row = _fetch_config_row(connection, int(cursor.lastrowid))
    if row is None:
        raise GraphConfigNotFoundError("Created graph config could not be loaded.")
    return _row_to_record(row)


def update_graph_config(config_id: int, payload: GraphConfigUpdateRequest) -> GraphConfigRecord:
    prompt_values = resolve_prompt_values(
        graph_type=payload.graph_type,
        prompt_values=payload.prompt_values,
        system_prompt=payload.system_prompt,
        analyzer_prompt=payload.analyzer_prompt,
        deconstructor_prompt=payload.deconstructor_prompt,
    )
    legacy_prompt_values = merge_legacy_prompt_inputs(
        prompt_values=payload.prompt_values,
        system_prompt=payload.system_prompt,
        analyzer_prompt=payload.analyzer_prompt,
        deconstructor_prompt=payload.deconstructor_prompt,
    )
    system_prompt = legacy_prompt_values["system_prompt"]
    _, analyzer_prompt, deconstructor_prompt = prompt_values_to_columns(prompt_values)
    prompt_values_json = json.dumps(prompt_values, ensure_ascii=False, sort_keys=True)
    with get_connection() as connection:
        existing_row = _fetch_config_row(connection, config_id)
        if existing_row is None:
            raise GraphConfigNotFoundError(f"Graph config {config_id} was not found.")

        connection.execute(
            """
            UPDATE graph_configs
            SET name = ?, graph_type = ?, system_prompt = ?, analyzer_prompt = ?, deconstructor_prompt = ?, prompt_values_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                payload.name,
                payload.graph_type.value,
                system_prompt,
                analyzer_prompt,
                deconstructor_prompt,
                prompt_values_json,
                config_id,
            ),
        )
        row = _fetch_config_row(connection, config_id)

    if row is None:
        raise GraphConfigNotFoundError(f"Graph config {config_id} was not found.")
    return _row_to_record(row)


def activate_graph_config(config_id: int) -> GraphConfigRecord:
    with get_connection() as connection:
        existing_row = _fetch_config_row(connection, config_id)
        if existing_row is None:
            raise GraphConfigNotFoundError(f"Graph config {config_id} was not found.")

        connection.execute("UPDATE graph_configs SET is_active = 0")
        connection.execute(
            "UPDATE graph_configs SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (config_id,),
        )
        row = _fetch_config_row(connection, config_id)

    if row is None:
        raise GraphConfigNotFoundError(f"Graph config {config_id} was not found.")
    return _row_to_record(row)


def delete_graph_config(config_id: int) -> None:
    with get_connection() as connection:
        existing_row = _fetch_config_row(connection, config_id)
        if existing_row is None:
            raise GraphConfigNotFoundError(f"Graph config {config_id} was not found.")

        is_active = bool(existing_row["is_active"])
        next_config = connection.execute(
            """
            SELECT id
            FROM graph_configs
            WHERE id != ?
            ORDER BY is_active DESC, updated_at DESC, id DESC
            LIMIT 1
            """,
            (config_id,),
        ).fetchone()
        fallback_graph_config_id = int(next_config["id"]) if next_config else None

        connection.execute(
            "UPDATE conversations SET graph_config_id = ? WHERE graph_config_id = ?",
            (fallback_graph_config_id, config_id),
        )
        connection.execute("DELETE FROM graph_configs WHERE id = ?", (config_id,))

        if is_active and fallback_graph_config_id is not None:
            connection.execute(
                "UPDATE graph_configs SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (fallback_graph_config_id,),
            )
