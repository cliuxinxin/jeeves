import sqlite3

from .database import get_connection
from .schemas import LLMConfigCreateRequest, LLMConfigRecord, LLMConfigUpdateRequest


class LLMConfigNotFoundError(Exception):
    pass


def _mask_api_key(api_key: str) -> str:
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}{'*' * max(4, len(api_key) - 8)}{api_key[-4:]}"


def _row_to_record(row: sqlite3.Row) -> LLMConfigRecord:
    payload = dict(row)
    payload["is_active"] = bool(payload["is_active"])
    payload["api_key_masked"] = _mask_api_key(payload["api_key"])
    return LLMConfigRecord.model_validate(payload)


def _fetch_config_row(connection: sqlite3.Connection, config_id: int) -> sqlite3.Row | None:
    return connection.execute("SELECT * FROM llm_configs WHERE id = ?", (config_id,)).fetchone()


def list_llm_configs() -> list[LLMConfigRecord]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM llm_configs
            ORDER BY is_active DESC, updated_at DESC, id DESC
            """
        ).fetchall()
    return [_row_to_record(row) for row in rows]


def get_active_llm_config() -> LLMConfigRecord | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM llm_configs
            WHERE is_active = 1
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        ).fetchone()
    return _row_to_record(row) if row else None


def create_llm_config(payload: LLMConfigCreateRequest) -> LLMConfigRecord:
    with get_connection() as connection:
        config_count = connection.execute("SELECT COUNT(*) FROM llm_configs").fetchone()[0]
        cursor = connection.execute(
            """
            INSERT INTO llm_configs (name, api_key, model, base_url, temperature, max_retries, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                payload.name,
                payload.api_key,
                payload.model,
                payload.base_url,
                payload.temperature,
                payload.max_retries,
                1 if config_count == 0 else 0,
            ),
        )
        row = _fetch_config_row(connection, int(cursor.lastrowid))
    if row is None:
        raise LLMConfigNotFoundError("Created config could not be loaded.")
    return _row_to_record(row)


def update_llm_config(config_id: int, payload: LLMConfigUpdateRequest) -> LLMConfigRecord:
    with get_connection() as connection:
        existing_row = _fetch_config_row(connection, config_id)
        if existing_row is None:
            raise LLMConfigNotFoundError(f"LLM config {config_id} was not found.")

        api_key = payload.api_key or existing_row["api_key"]
        connection.execute(
            """
            UPDATE llm_configs
            SET name = ?, api_key = ?, model = ?, base_url = ?, temperature = ?, max_retries = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                payload.name,
                api_key,
                payload.model,
                payload.base_url,
                payload.temperature,
                payload.max_retries,
                config_id,
            ),
        )
        row = _fetch_config_row(connection, config_id)

    if row is None:
        raise LLMConfigNotFoundError(f"LLM config {config_id} was not found.")
    return _row_to_record(row)


def activate_llm_config(config_id: int) -> LLMConfigRecord:
    with get_connection() as connection:
        existing_row = _fetch_config_row(connection, config_id)
        if existing_row is None:
            raise LLMConfigNotFoundError(f"LLM config {config_id} was not found.")

        connection.execute("UPDATE llm_configs SET is_active = 0")
        connection.execute(
            "UPDATE llm_configs SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (config_id,),
        )
        row = _fetch_config_row(connection, config_id)

    if row is None:
        raise LLMConfigNotFoundError(f"LLM config {config_id} was not found.")
    return _row_to_record(row)
