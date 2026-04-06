import sqlite3

from .database import get_connection
from .schemas import (
    ConversationMessageRecord,
    ConversationRecord,
    ConversationSummary,
)


class ConversationNotFoundError(Exception):
    pass


def _row_to_conversation_summary(row: sqlite3.Row) -> ConversationSummary:
    payload = dict(row)
    payload["preview"] = (payload.get("preview") or "").strip()
    return ConversationSummary.model_validate(payload)


def _row_to_conversation_record(row: sqlite3.Row) -> ConversationRecord:
    return ConversationRecord.model_validate(dict(row))


def _row_to_message_record(row: sqlite3.Row) -> ConversationMessageRecord:
    return ConversationMessageRecord.model_validate(dict(row))


def create_conversation(title: str = "New chat") -> ConversationRecord:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO conversations (title, updated_at)
            VALUES (?, CURRENT_TIMESTAMP)
            """,
            (title,),
        )
        row = connection.execute(
            "SELECT * FROM conversations WHERE id = ?", (int(cursor.lastrowid),)
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
            LEFT JOIN conversation_messages ON conversation_messages.conversation_id = conversations.id
            GROUP BY conversations.id
            ORDER BY conversations.updated_at DESC, conversations.id DESC
            """
        ).fetchall()

    return [_row_to_conversation_summary(row) for row in rows]


def get_conversation(conversation_id: int) -> ConversationRecord:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
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
            SELECT id, conversation_id, role, content, created_at
            FROM conversation_messages
            WHERE conversation_id = ?
            ORDER BY id ASC
            """,
            (conversation_id,),
        ).fetchall()

    return [_row_to_message_record(row) for row in rows]


def append_message(conversation_id: int, role: str, content: str) -> ConversationMessageRecord:
    with get_connection() as connection:
        exists = connection.execute(
            "SELECT title FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if exists is None:
            raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")

        cursor = connection.execute(
            """
            INSERT INTO conversation_messages (conversation_id, role, content)
            VALUES (?, ?, ?)
            """,
            (conversation_id, role, content),
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
            SELECT id, conversation_id, role, content, created_at
            FROM conversation_messages
            WHERE id = ?
            """,
            (int(cursor.lastrowid),),
        ).fetchone()

    if row is None:
        raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")
    return _row_to_message_record(row)


def delete_conversation(conversation_id: int) -> None:
    with get_connection() as connection:
        exists = connection.execute(
            "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if exists is None:
            raise ConversationNotFoundError(f"Conversation {conversation_id} was not found.")

        connection.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
