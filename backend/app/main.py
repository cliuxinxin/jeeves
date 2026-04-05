import json
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import get_settings
from .conversation_store import (
    ConversationNotFoundError,
    append_message,
    create_conversation,
    get_conversation,
    get_conversation_messages,
    list_conversations,
)
from .database import init_db
from .graph import get_graph
from .llm import get_llm, resolve_llm_config, test_llm_config
from .llm_config_store import (
    LLMConfigNotFoundError,
    activate_llm_config,
    create_llm_config,
    list_llm_configs,
    update_llm_config,
)
from .messages import (
    build_conversation,
    build_conversation_from_history,
    extract_chunk_text,
    from_langchain_message,
)
from .schemas import (
    ChatRequest,
    ChatResponse,
    ChatStreamRequest,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationRecord,
    HealthResponse,
    LLMConfigCreateRequest,
    LLMConfigListResponse,
    LLMConfigRecord,
    LLMConfigTestRequest,
    LLMConfigTestResponse,
    LLMConfigUpdateRequest,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Minimal LangGraph + FastAPI backend for the Jeeves assistant.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "Jeeves backend is running."}


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        runtime_config = resolve_llm_config()
        return HealthResponse(
            status="ok",
            configured=True,
            source=runtime_config.source,
            config_name=runtime_config.name,
            model=runtime_config.model,
            max_retries=runtime_config.max_retries,
        )
    except RuntimeError:
        return HealthResponse(status="ok", configured=False)


@app.get("/api/llm-configs", response_model=LLMConfigListResponse)
async def get_llm_configs() -> LLMConfigListResponse:
    items = list_llm_configs()
    active_config = next((item for item in items if item.is_active), None)
    return LLMConfigListResponse(items=items, active_config_id=active_config.id if active_config else None)


@app.post("/api/llm-configs", response_model=LLMConfigRecord, status_code=201)
async def create_llm_config_endpoint(payload: LLMConfigCreateRequest) -> LLMConfigRecord:
    try:
        return create_llm_config(payload)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A config with this name already exists.") from exc


@app.put("/api/llm-configs/{config_id}", response_model=LLMConfigRecord)
async def update_llm_config_endpoint(config_id: int, payload: LLMConfigUpdateRequest) -> LLMConfigRecord:
    try:
        return update_llm_config(config_id, payload)
    except LLMConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A config with this name already exists.") from exc


@app.post("/api/llm-configs/{config_id}/activate", response_model=LLMConfigRecord)
async def activate_llm_config_endpoint(config_id: int) -> LLMConfigRecord:
    try:
        return activate_llm_config(config_id)
    except LLMConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/llm-configs/test", response_model=LLMConfigTestResponse)
async def test_llm_config_endpoint(payload: LLMConfigTestRequest) -> LLMConfigTestResponse:
    try:
        preview = await test_llm_config(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {exc}") from exc

    return LLMConfigTestResponse(success=True, message="Connection test succeeded.", response_preview=preview)


@app.get("/api/conversations", response_model=ConversationListResponse)
async def get_conversations() -> ConversationListResponse:
    return ConversationListResponse(items=list_conversations())


@app.post("/api/conversations", response_model=ConversationRecord, status_code=201)
async def create_conversation_endpoint() -> ConversationRecord:
    return create_conversation()


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_endpoint(conversation_id: int) -> ConversationDetailResponse:
    try:
        conversation = get_conversation(conversation_id)
        messages = get_conversation_messages(conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return ConversationDetailResponse(conversation=conversation, messages=messages)


def _sse_event(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(payload: ChatStreamRequest) -> StreamingResponse:
    try:
        conversation = get_conversation(payload.conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    user_message = append_message(conversation.id, "user", payload.message)

    async def event_generator():
        yield _sse_event(
            "user_message",
            {
                "message": user_message.model_dump(),
                "conversation": conversation.model_dump(),
            },
        )

        try:
            history = get_conversation_messages(conversation.id)
            llm = get_llm()
            chunks: list[str] = []

            async for chunk in llm.astream(build_conversation_from_history(history)):
                text = extract_chunk_text(chunk)
                if not text:
                    continue

                chunks.append(text)
                yield _sse_event("chunk", {"text": text})

            assistant_content = "".join(chunks).strip() or "模型返回了空响应。"
            assistant_message = append_message(conversation.id, "assistant", assistant_content)
            updated_conversation = get_conversation(conversation.id)

            yield _sse_event(
                "done",
                {
                    "message": assistant_message.model_dump(),
                    "conversation": updated_conversation.model_dump(),
                },
            )
        except RuntimeError as exc:
            yield _sse_event("error", {"message": str(exc)})
        except Exception as exc:
            yield _sse_event("error", {"message": f"Chat stream failed: {exc}"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    try:
        result = await get_graph().ainvoke({"messages": build_conversation(payload)})
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat request failed: {exc}") from exc

    assistant_message = from_langchain_message(result["messages"][-1])
    return ChatResponse(response=assistant_message.content, message=assistant_message)
