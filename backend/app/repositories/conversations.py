import sqlite3
from json import dumps, loads

from ..database import get_connection
from ..schemas import ConversationMessageRecord, ConversationRecord, ConversationSummary
from .graph_configs import get_active_graph_config


class ConversationNotFoundError(Exception):
    pass


class ConversationGraphConfigNotFoundError(Exception):
    pass


def _row_to_conversation_summary(row: sqlite3.Row) -> ConversationSummary:
    payload = dict(row)
    payload["preview"] = (payload.get("preview") or "").strip()
    return ConversationSummary.model_validate(payload)


def _row_to_conversation_record(row: sqlite3.Row) -> ConversationRecord:
    return ConversationRecord.model_validate(dict(row))


def _row_to_message_record(row: sqlite3.Row) -> ConversationMessageRecord:
    payload = dict(row)
    payload["state_patch"] = loads(payload.get("state_patch") or "{}")
    return ConversationMessageRecord.model_validate(payload)


def _validate_graph_config_id(
    connection: sqlite3.Connection, graph_config_id: int | None
) -> int | None:
    if graph_config_id is None:
        return None

    row = connection.execute(
        "SELECT id FROM graph_configs WHERE id = ?",
        (graph_config_id,),
    ).fetchone()
    if row is None:
        raise ConversationGraphConfigNotFoundError(f"Graph config {graph_config_id} was not found.")
    return int(row["id"])


def create_conversation(
    title: str = "New chat",
    *,
    graph_config_id: int | None = None,
) -> ConversationRecord:
    with get_connection() as connection:
        resolved_graph_config_id = graph_config_id
        if resolved_graph_config_id is None:
            active_graph_config = get_active_graph_config()
            resolved_graph_config_id = active_graph_config.id if active_graph_config else None

        resolved_graph_config_id = _validate_graph_config_id(connection, resolved_graph_config_id)
        cursor = connection.execute(
            """
            INSERT INTO conversations (title, graph_config_id, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            """,
            (title, resolved_graph_config_id),
        )
        row = connection.execute(
            """
            SELECT
                conversations.id,
                conversations.title,
                conversations.graph_config_id,
                graph_configs.name AS graph_config_name,
                conversations.created_at,
                conversations.updated_at
            FROM conversations
            LEFT JOIN graph_configs ON graph_configs.id = conversations.graph_config_id
            WHERE conversations.id = ?
            """,
            (int(cursor.lastrowid),),
        ).fetchone()

    if row is None:
        raise ConversationNotFoundError("Conversation could not be created.")
    return _row_to_conversation_record(row)


def list_conversations() -> list[ConversationSummary]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                conversations.id,
                conversations.title,
                conversations.graph_config_id,
                graph_configs.name AS graph_config_name,
                conversations.created_at,
                conversations.updated_at,
                COUNT(conversation_messages.id) AS message_count,
                COALESCE(
                    (
                        SELECT content
                        FROM conversation_messages AS latest_message
                        WHERE latest_message.conversation_id = conversations.id
                        ORDER BY latest_message.id DESC
                        LIMIT 1
                    ),
                    ''
                ) AS preview
            FROM conversations
            LEFT JOIN graph_configs ON graph_configs.id = conversations.graph_config_id
            LEFT JOIN conversation_messages ON conversation_messages.conversation_id = conversations.id
            GROUP BY conversations.id
            ORDER BY conversations.updated_at DESC, conversations.id DESC
            """
        ).fetchall()

    return [_row_to_conversation_summary(row) for row in rows]


def get_conversation(conversation_id: int) -> ConversationRecord:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                conversations.id,
                conversations.title,
                conversations.graph_config_id,
                graph_configs.name AS graph_config_name,
                conversations.created_at,
                conversations.updated_at
            FROM conversations
            LEFT JOIN graph_configs ON graph_configs.id = conversations.graph_config_id
            WHERE conversations.id = ?
            """,
            (conversation_id,),
        ).fetchone()

    if row is None:
        raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")
    return _row_to_conversation_record(row)


def get_conversation_messages(conversation_id: int) -> list[ConversationMessageRecord]:
    with get_connection() as connection:
        exists = connection.execute(
            "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if exists is None:
            raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")

        rows = connection.execute(
            """
            SELECT
                id,
                conversation_id,
                role,
                content,
                node_name AS node,
                node_label,
                state_patch,
                created_at
            FROM conversation_messages
            WHERE conversation_id = ?
            ORDER BY id ASC
            """,
            (conversation_id,),
        ).fetchall()

    return [_row_to_message_record(row) for row in rows]


def append_message(
    conversation_id: int,
    role: str,
    content: str,
    *,
    node: str | None = None,
    node_label: str | None = None,
    state_patch: dict[str, str] | None = None,
) -> ConversationMessageRecord:
    with get_connection() as connection:
        exists = connection.execute(
            "SELECT title FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if exists is None:
            raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")

        cursor = connection.execute(
            """
            INSERT INTO conversation_messages (
                conversation_id,
                role,
                content,
                node_name,
                node_label,
                state_patch
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
                role,
                content,
                node,
                node_label,
                dumps(state_patch or {}, ensure_ascii=False),
            ),
        )
        connection.execute(
            """
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (conversation_id,),
        )

        if role == "user" and exists["title"] == "New chat":
            first_user_row = connection.execute(
                """
                SELECT COUNT(*) AS user_count
                FROM conversation_messages
                WHERE conversation_id = ? AND role = 'user'
                """,
                (conversation_id,),
            ).fetchone()
            if first_user_row and first_user_row["user_count"] == 1:
                connection.execute(
                    """
                    UPDATE conversations
                    SET title = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (content.strip()[:48] or "New chat", conversation_id),
                )

        row = connection.execute(
            """
            SELECT
                id,
                conversation_id,
                role,
                content,
                node_name AS node,
                node_label,
                state_patch,
                created_at
            FROM conversation_messages
            WHERE id = ?
            """,
            (int(cursor.lastrowid),),
        ).fetchone()

    if row is None:
        raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")
    return _row_to_message_record(row)


def update_conversation_title(conversation_id: int, title: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE conversations
            SET title = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (title, conversation_id),
        )


def update_conversation(
    conversation_id: int,
    *,
    title: str | None = None,
    title_provided: bool = False,
    graph_config_id: int | None = None,
    graph_config_id_provided: bool = False,
) -> ConversationRecord:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT 1 FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if existing is None:
            raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")

        if title_provided:
            connection.execute(
                """
                UPDATE conversations
                SET title = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (title or "New chat", conversation_id),
            )

        if graph_config_id_provided:
            resolved_graph_config_id = _validate_graph_config_id(connection, graph_config_id)
            connection.execute(
                """
                UPDATE conversations
                SET graph_config_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (resolved_graph_config_id, conversation_id),
            )

        row = connection.execute(
            """
            SELECT
                conversations.id,
                conversations.title,
                conversations.graph_config_id,
                graph_configs.name AS graph_config_name,
                conversations.created_at,
                conversations.updated_at
            FROM conversations
            LEFT JOIN graph_configs ON graph_configs.id = conversations.graph_config_id
            WHERE conversations.id = ?
            """,
            (conversation_id,),
        ).fetchone()

    if row is None:
        raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")
    return _row_to_conversation_record(row)


def delete_conversation(conversation_id: int) -> None:
    with get_connection() as connection:
        exists = connection.execute(
            "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if exists is None:
            raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")

        connection.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
