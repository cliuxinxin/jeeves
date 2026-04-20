from __future__ import annotations

import sqlite3

from ..database import get_connection
from ..schemas import LikedCardRecord


class LikedCardNotFoundError(Exception):
    pass


class LikedCardSourceNotFoundError(Exception):
    pass


def _row_to_record(row: sqlite3.Row) -> LikedCardRecord:
    return LikedCardRecord.model_validate(dict(row))


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
            liked_cards.source_message_id,
            liked_cards.card_index,
            liked_cards.route_label,
            liked_cards.title,
            liked_cards.content,
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
            SELECT conversation_id
            FROM conversation_messages
            WHERE id = ? AND role = 'assistant'
            """,
            (source_message_id,),
        ).fetchone()
        if source is None or int(source["conversation_id"]) != conversation_id:
            raise LikedCardSourceNotFoundError("Card source message was not found.")

        connection.execute(
            """
            INSERT INTO liked_cards (
                conversation_id,
                source_message_id,
                card_index,
                route_label,
                title,
                content
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_message_id, card_index)
            DO UPDATE SET
                conversation_id = excluded.conversation_id,
                route_label = excluded.route_label,
                title = excluded.title,
                content = excluded.content
            """,
            (
                conversation_id,
                source_message_id,
                card_index,
                route_label,
                title,
                content,
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
                liked_cards.source_message_id,
                liked_cards.card_index,
                liked_cards.route_label,
                liked_cards.title,
                liked_cards.content,
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
