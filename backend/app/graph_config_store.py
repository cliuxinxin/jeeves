import sqlite3

from .database import get_connection
from .schemas import GraphConfigCreateRequest, GraphConfigRecord, GraphConfigUpdateRequest


class GraphConfigNotFoundError(Exception):
    pass


def _row_to_record(row: sqlite3.Row) -> GraphConfigRecord:
    payload = dict(row)
    payload["is_active"] = bool(payload["is_active"])
    return GraphConfigRecord.model_validate(payload)


def _fetch_config_row(connection: sqlite3.Connection, config_id: int) -> sqlite3.Row | None:
    return connection.execute("SELECT * FROM graph_configs WHERE id = ?", (config_id,)).fetchone()


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
    with get_connection() as connection:
        config_count = connection.execute("SELECT COUNT(*) FROM graph_configs").fetchone()[0]
        cursor = connection.execute(
            """
            INSERT INTO graph_configs (name, graph_type, system_prompt, analyzer_prompt, deconstructor_prompt, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                payload.name,
                payload.graph_type,
                payload.system_prompt,
                payload.analyzer_prompt,
                payload.deconstructor_prompt,
                1 if config_count == 0 else 0,
            ),
        )
        row = _fetch_config_row(connection, int(cursor.lastrowid))
    if row is None:
        raise GraphConfigNotFoundError("Created graph config could not be loaded.")
    return _row_to_record(row)


def update_graph_config(config_id: int, payload: GraphConfigUpdateRequest) -> GraphConfigRecord:
    with get_connection() as connection:
        existing_row = _fetch_config_row(connection, config_id)
        if existing_row is None:
            raise GraphConfigNotFoundError(f"Graph config {config_id} was not found.")

        connection.execute(
            """
            UPDATE graph_configs
            SET name = ?, graph_type = ?, system_prompt = ?, analyzer_prompt = ?, deconstructor_prompt = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                payload.name,
                payload.graph_type,
                payload.system_prompt,
                payload.analyzer_prompt,
                payload.deconstructor_prompt,
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
        connection.execute("DELETE FROM graph_configs WHERE id = ?", (config_id,))

        if is_active:
            next_config = connection.execute(
                "SELECT id FROM graph_configs ORDER BY updated_at DESC, id DESC LIMIT 1"
            ).fetchone()
            if next_config:
                connection.execute(
                    "UPDATE graph_configs SET is_active = 1 WHERE id = ?", (next_config["id"],)
                )
