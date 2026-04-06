from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..repositories.conversations import ConversationNotFoundError, get_conversation
from ..schemas import ChatRequest, ChatResponse, ChatStreamRequest
from ..services.chat_service import run_chat, stream_chat_events
from ..telemetry import get_request_id

router = APIRouter(tags=["chat"])


@router.post("/api/chat/stream")
async def chat_stream(request: Request, payload: ChatStreamRequest) -> StreamingResponse:
    try:
        get_conversation(payload.conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return StreamingResponse(
        stream_chat_events(request, payload, request_id=get_request_id(request)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: Request, payload: ChatRequest) -> ChatResponse:
    try:
        return await run_chat(payload, request_id=get_request_id(request))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat request failed: {exc}") from exc
