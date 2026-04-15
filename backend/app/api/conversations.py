from fastapi import APIRouter, HTTPException

from ..repositories.conversations import (
    ConversationGraphConfigNotFoundError,
    ConversationNotFoundError,
    create_conversation,
    delete_conversation,
    get_conversation,
    get_conversation_messages,
    list_conversations,
    update_conversation,
)
from ..schemas import (
    ConversationCreateRequest,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationRecord,
    ConversationUpdateRequest,
)

router = APIRouter(tags=["conversations"])


@router.get("/api/conversations", response_model=ConversationListResponse)
async def get_conversations() -> ConversationListResponse:
    return ConversationListResponse(items=list_conversations())


@router.post("/api/conversations", response_model=ConversationRecord, status_code=201)
async def create_conversation_endpoint(
    payload: ConversationCreateRequest | None = None,
) -> ConversationRecord:
    resolved_payload = payload or ConversationCreateRequest()
    try:
        return create_conversation(
            title=resolved_payload.title,
            graph_config_id=resolved_payload.graph_config_id,
        )
    except ConversationGraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_endpoint(conversation_id: int) -> ConversationDetailResponse:
    try:
        conversation = get_conversation(conversation_id)
        messages = get_conversation_messages(conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return ConversationDetailResponse(conversation=conversation, messages=messages)


@router.patch("/api/conversations/{conversation_id}", response_model=ConversationRecord)
async def update_conversation_endpoint(
    conversation_id: int,
    payload: ConversationUpdateRequest,
) -> ConversationRecord:
    try:
        return update_conversation(
            conversation_id,
            title=payload.title,
            title_provided="title" in payload.model_fields_set,
            graph_config_id=payload.graph_config_id,
            graph_config_id_provided="graph_config_id" in payload.model_fields_set,
        )
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConversationGraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: int) -> dict[str, str]:
    try:
        delete_conversation(conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok"}
