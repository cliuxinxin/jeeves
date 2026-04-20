import sqlite3

from fastapi import APIRouter, HTTPException, Query

from ..database import is_sqlite_lock_error
from ..repositories.liked_cards import (
    LikedCardNotFoundError,
    LikedCardSourceNotFoundError,
    create_liked_card,
    delete_liked_card,
    list_liked_cards,
)
from ..schemas import LikedCardCreateRequest, LikedCardListResponse, LikedCardRecord

router = APIRouter(tags=["liked-cards"])


def _raise_if_sqlite_busy(error: sqlite3.OperationalError) -> None:
    if is_sqlite_lock_error(error):
        raise HTTPException(status_code=503, detail="数据库正忙，请稍后重试。") from error
    raise error


@router.get("/api/liked-cards", response_model=LikedCardListResponse)
async def get_liked_cards(
    conversation_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> LikedCardListResponse:
    try:
        return LikedCardListResponse(
            items=list_liked_cards(conversation_id=conversation_id, limit=limit),
        )
    except sqlite3.OperationalError as exc:
        _raise_if_sqlite_busy(exc)


@router.post("/api/liked-cards", response_model=LikedCardRecord, status_code=201)
async def create_liked_card_endpoint(payload: LikedCardCreateRequest) -> LikedCardRecord:
    try:
        return create_liked_card(
            conversation_id=payload.conversation_id,
            source_message_id=payload.source_message_id,
            card_index=payload.card_index,
            route_label=payload.route_label,
            title=payload.title,
            content=payload.content,
        )
    except LikedCardSourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.OperationalError as exc:
        _raise_if_sqlite_busy(exc)


@router.delete("/api/liked-cards/{liked_card_id}")
async def delete_liked_card_endpoint(liked_card_id: int) -> dict[str, str]:
    try:
        delete_liked_card(liked_card_id)
    except LikedCardNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.OperationalError as exc:
        _raise_if_sqlite_busy(exc)
    return {"status": "ok"}
