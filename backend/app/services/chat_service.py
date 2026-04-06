from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import Request
from langchain_core.prompts import PromptTemplate

from ..graph import get_graph
from ..llm import get_llm
from ..messages import (
    build_conversation,
    build_conversation_from_history,
    extract_chunk_text,
    extract_text_content,
    from_langchain_message,
)
from ..repositories.conversations import (
    append_message,
    get_conversation,
    get_conversation_messages,
    update_conversation_title,
)
from ..schemas import ChatRequest, ChatResponse, ChatStreamRequest, ConversationMessageRecord
from ..telemetry import log_event


class ClientDisconnectedError(Exception):
    pass


def sse_event(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _serialize_message(
    message: ConversationMessageRecord, *, node: str | None = None
) -> dict[str, object]:
    payload = message.model_dump()
    if node:
        payload["node"] = node
    return payload


async def _generate_conversation_title(
    conversation_id: int,
    user_text: str,
    assistant_text: str,
) -> None:
    title_llm = get_llm()
    prompt = PromptTemplate.from_template(
        "Summarize the following chat in a short 3-5 word title. Only respond with the title, nothing else. Chat:\nUser: {u}\nAssistant: {a}"
    )
    title_response = await title_llm.ainvoke(prompt.format(u=user_text, a=assistant_text))
    new_title = extract_text_content(getattr(title_response, "content", "")).strip().strip('"')
    if not new_title:
        return

    update_conversation_title(conversation_id, new_title)
    log_event(
        "audit_conversation_title_generated",
        conversation_id=conversation_id,
        title=new_title,
    )


async def stream_chat_events(
    request: Request,
    payload: ChatStreamRequest,
    *,
    request_id: str,
) -> AsyncIterator[str]:
    conversation = get_conversation(payload.conversation_id)
    user_message = append_message(conversation.id, "user", payload.message)

    queue: asyncio.Queue[str] = asyncio.Queue()
    stop = asyncio.Event()

    async def ensure_connected() -> None:
        if await request.is_disconnected():
            raise ClientDisconnectedError()

    async def pinger() -> None:
        while not stop.is_set():
            await ensure_connected()
            await queue.put(sse_event("ping", {"ts": asyncio.get_running_loop().time()}))
            try:
                await asyncio.wait_for(stop.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                continue

    async def run_graph() -> None:
        node_contents: dict[str, list[str]] = {}
        node_order: list[str] = []

        try:
            async with asyncio.timeout(180):
                await ensure_connected()
                await queue.put(
                    sse_event(
                        "user_message",
                        {
                            "message": user_message.model_dump(),
                            "conversation": conversation.model_dump(),
                        },
                    )
                )

                history = get_conversation_messages(conversation.id)
                graph = get_graph()
                log_event(
                    "audit_graph_execution_started",
                    request_id=request_id,
                    conversation_id=conversation.id,
                    graph_name=graph.__class__.__name__,
                )

                async for chunk, metadata in graph.astream(
                    {"messages": build_conversation_from_history(history)},
                    stream_mode="messages",
                ):
                    await ensure_connected()
                    node = metadata.get("langgraph_node")
                    if node in ("assistant", "analyzer", "deconstructor"):
                        text = extract_chunk_text(chunk)
                        if text:
                            if node not in node_contents:
                                node_contents[node] = []
                                node_order.append(node)
                            node_contents[node].append(text)
                            await queue.put(sse_event("chunk", {"node": node, "text": text}))

                final_messages: list[dict[str, object]] = []
                for node in node_order:
                    content = "".join(node_contents[node]).strip()
                    if not content:
                        continue
                    saved_message = append_message(conversation.id, "assistant", content)
                    final_messages.append(_serialize_message(saved_message, node=node))

                if not final_messages:
                    saved_message = append_message(
                        conversation.id, "assistant", "模型返回了空响应。"
                    )
                    final_messages.append(_serialize_message(saved_message, node="assistant"))

                updated_conversation = get_conversation(conversation.id)
                await ensure_connected()
                await queue.put(
                    sse_event(
                        "done",
                        {
                            "messages": final_messages,
                            "conversation": updated_conversation.model_dump(),
                        },
                    )
                )

                assistant_text = "\n\n".join(
                    str(message["content"]) for message in final_messages if message.get("content")
                ).strip()
                if assistant_text and (
                    conversation.title == "New chat"
                    or conversation.title == user_message.content.strip()[:48]
                ):
                    asyncio.create_task(
                        _generate_conversation_title(
                            conversation.id, user_message.content, assistant_text
                        )
                    )

                log_event(
                    "audit_graph_execution_completed",
                    request_id=request_id,
                    conversation_id=conversation.id,
                    assistant_message_count=len(final_messages),
                )
                log_event(
                    "chat_stream_completed",
                    request_id=request_id,
                    conversation_id=conversation.id,
                )
        except ClientDisconnectedError:
            log_event(
                "chat_stream_disconnected",
                request_id=request_id,
                conversation_id=conversation.id,
            )
        except TimeoutError:
            await queue.put(sse_event("error", {"message": "请求超时，请稍后重试。"}))
            log_event(
                "chat_stream_timeout",
                request_id=request_id,
                conversation_id=conversation.id,
            )
        except RuntimeError as exc:
            await queue.put(sse_event("error", {"message": str(exc)}))
            log_event(
                "chat_stream_failed",
                request_id=request_id,
                conversation_id=conversation.id,
                error=str(exc),
            )
        except Exception as exc:
            await queue.put(sse_event("error", {"message": f"Chat stream failed: {exc}"}))
            log_event(
                "chat_stream_failed",
                request_id=request_id,
                conversation_id=conversation.id,
                error=str(exc),
            )
        finally:
            stop.set()

    ping_task = asyncio.create_task(pinger())
    graph_task = asyncio.create_task(run_graph())

    try:
        while True:
            if graph_task.done() and queue.empty():
                break
            if await request.is_disconnected():
                graph_task.cancel()
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            yield event
    finally:
        stop.set()
        ping_task.cancel()
        graph_task.cancel()
        await asyncio.gather(ping_task, graph_task, return_exceptions=True)


async def run_chat(payload: ChatRequest, *, request_id: str) -> ChatResponse:
    log_event("chat_request_started", request_id=request_id)
    result = await get_graph().ainvoke({"messages": build_conversation(payload)})
    assistant_message = from_langchain_message(result["messages"][-1])
    log_event("chat_request_completed", request_id=request_id)
    return ChatResponse(response=assistant_message.content, message=assistant_message)
