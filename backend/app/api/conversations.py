from fastapi import APIRouter, HTTPException

from ..repositories.conversations import (
    ConversationNotFoundError,
    create_conversation,
    delete_conversation,
    get_conversation,
    get_conversation_messages,
    list_conversations,
)
from ..schemas import ConversationDetailResponse, ConversationListResponse, ConversationRecord

router = APIRouter(tags=["conversations"])


@router.get("/api/conversations", response_model=ConversationListResponse)
async def get_conversations() -> ConversationListResponse:
    return ConversationListResponse(items=list_conversations())


@router.post("/api/conversations", response_model=ConversationRecord, status_code=201)
async def create_conversation_endpoint() -> ConversationRecord:
    return create_conversation()


@router.get("/api/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_endpoint(conversation_id: int) -> ConversationDetailResponse:
    try:
        conversation = get_conversation(conversation_id)
        messages = get_conversation_messages(conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return ConversationDetailResponse(conversation=conversation, messages=messages)


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: int) -> dict[str, str]:
    try:
        delete_conversation(conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok"}
