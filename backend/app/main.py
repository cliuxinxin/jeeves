import json
import sqlite3
import asyncio
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
    delete_conversation,
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
    delete_llm_config,
)
from .graph_config_store import (
    GraphConfigNotFoundError,
    list_graph_configs,
    create_graph_config,
    update_graph_config,
    activate_graph_config,
    delete_graph_config,
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
    GraphConfigCreateRequest,
    GraphConfigUpdateRequest,
    GraphConfigRecord,
    GraphConfigListResponse,
)

from langchain_core.prompts import PromptTemplate

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
def api_activate_llm_config(config_id: int):
    try:
        return activate_llm_config(config_id)
    except LLMConfigNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/api/llm-configs/{config_id}")
def api_delete_llm_config(config_id: int):
    try:
        delete_llm_config(config_id)
        return {"success": True}
    except LLMConfigNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


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


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: int):
    try:
        delete_conversation(conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok"}


@app.get("/api/graph-configs", response_model=GraphConfigListResponse)
async def get_graph_configs() -> GraphConfigListResponse:
    items = list_graph_configs()
    active_config = next((item for item in items if item.is_active), None)
    return GraphConfigListResponse(items=items, active_config_id=active_config.id if active_config else None)


@app.post("/api/graph-configs", response_model=GraphConfigRecord, status_code=201)
async def create_graph_config_endpoint(payload: GraphConfigCreateRequest) -> GraphConfigRecord:
    try:
        return create_graph_config(payload)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A graph config with this name already exists.") from exc


@app.put("/api/graph-configs/{config_id}", response_model=GraphConfigRecord)
async def update_graph_config_endpoint(config_id: int, payload: GraphConfigUpdateRequest) -> GraphConfigRecord:
    try:
        return update_graph_config(config_id, payload)
    except GraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A graph config with this name already exists.") from exc


@app.post("/api/graph-configs/{config_id}/activate", response_model=GraphConfigRecord)
async def activate_graph_config_endpoint(config_id: int) -> GraphConfigRecord:
    try:
        return activate_graph_config(config_id)
    except GraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/graph-configs/{config_id}", status_code=204)
async def delete_graph_config_endpoint(config_id: int):
    try:
        delete_graph_config(config_id)
    except GraphConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
            graph = get_graph()
            
            node_contents: dict[str, list[str]] = {}
            node_order: list[str] = []

            async for chunk, metadata in graph.astream(
                {"messages": build_conversation_from_history(history)},
                stream_mode="messages",
            ):
                node = metadata.get("langgraph_node")
                if node in ("assistant", "analyzer", "deconstructor"):
                    text = extract_chunk_text(chunk)
                    if text:
                        if node not in node_contents:
                            node_contents[node] = []
                            node_order.append(node)
                        node_contents[node].append(text)
                        yield _sse_event("chunk", {"node": node, "text": text})

            assistant_messages = []
            for node in node_order:
                content = "".join(node_contents[node]).strip()
                if content:
                    msg = append_message(conversation.id, "assistant", content)
                    assistant_messages.append(msg)

            if not assistant_messages:
                msg = append_message(conversation.id, "assistant", "模型返回了空响应。")
                assistant_messages.append(msg)

            updated_conversation = get_conversation(conversation.id)

            yield _sse_event(
                "done",
                {
                    "messages": [m.model_dump() for m in assistant_messages],
                    "conversation": updated_conversation.model_dump(),
                },
            )

            # AI Title generation for new chats
            if conversation.title == "New chat" or conversation.title == user_message.content.strip()[:48]:
                async def generate_title(conv_id: int, u_text: str, a_text: str):
                    try:
                        title_llm = get_llm()
                        prompt = PromptTemplate.from_template("Summarize the following chat in a short 3-5 word title. Only respond with the title, nothing else. Chat:\nUser: {u}\nAssistant: {a}")
                        title_response = await title_llm.ainvoke(prompt.format(u=u_text, a=a_text))
                        new_title = extract_chunk_text(title_response).strip().strip('"')
                        if new_title:
                            from .database import get_connection
                            with get_connection() as connection:
                                connection.execute("UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_title, conv_id))
                    except Exception:
                        pass
                
                asyncio.create_task(generate_title(conversation.id, user_message.content, assistant_content))

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
