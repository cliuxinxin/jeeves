from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, cast

from fastapi import Request
from langchain_core.messages import AIMessageChunk
from langchain_core.prompts import PromptTemplate

from ..ai_logging import ai_log_scope
from ..graph import get_graph
from ..llm import get_llm
from ..messages import (
    build_conversation,
    build_conversation_from_history,
    extract_chunk_text,
    extract_text_content,
)
from ..node_runs import NodeRun, get_node_label, resolve_final_output
from ..repositories.conversations import (
    append_message,
    get_conversation,
    get_conversation_messages,
    update_conversation_title,
)
from ..schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ChatStreamRequest,
    ConversationMessageRecord,
)
from ..telemetry import log_event

CHAT_STREAM_TIMEOUT_SECONDS = 420


class ClientDisconnectedError(Exception):
    pass


def sse_event(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _serialize_message(message: ConversationMessageRecord) -> dict[str, object]:
    return message.model_dump()


def _normalize_node_run(candidate: object) -> NodeRun | None:
    if not isinstance(candidate, dict):
        return None

    node = candidate.get("node")
    node_label = candidate.get("node_label")
    output = candidate.get("output")
    state_patch = candidate.get("state_patch")
    if not isinstance(node, str) or not isinstance(output, str):
        return None

    return NodeRun(
        node=node,
        node_label=node_label if isinstance(node_label, str) else get_node_label(node),
        output=output,
        state_patch=state_patch if isinstance(state_patch, dict) else {},
    )


def _extract_node_runs(update_payload: object) -> list[NodeRun]:
    if not isinstance(update_payload, dict):
        return []

    collected: list[NodeRun] = []
    for node_update in update_payload.values():
        if not isinstance(node_update, dict):
            continue

        node_runs = node_update.get("node_runs")
        if not isinstance(node_runs, list):
            continue

        for candidate in node_runs:
            normalized = _normalize_node_run(candidate)
            if normalized:
                collected.append(normalized)

    return collected


def _persist_node_runs(
    conversation_id: int,
    *,
    node_runs: list[NodeRun],
) -> list[dict[str, object]]:
    final_messages: list[dict[str, object]] = []
    for node_run in node_runs:
        content = node_run["output"].strip()
        if not content:
            continue
        saved_message = append_message(
            conversation_id,
            "assistant",
            content,
            node=node_run["node"],
            node_label=node_run["node_label"],
            state_patch=node_run["state_patch"],
        )
        final_messages.append(_serialize_message(saved_message))

    return final_messages


def _build_partial_node_runs(
    *,
    completed_node_names: set[str],
    node_order: list[str],
    node_contents: dict[str, list[str]],
) -> list[NodeRun]:
    partial_runs: list[NodeRun] = []
    for node in node_order:
        if node in completed_node_names:
            continue

        content = "".join(node_contents.get(node, [])).strip()
        if not content:
            continue

        partial_runs.append(
            NodeRun(
                node=node,
                node_label=get_node_label(node),
                output=content,
                state_patch={},
            )
        )

    return partial_runs


async def _generate_conversation_title(
    conversation_id: int,
    user_text: str,
    assistant_text: str,
    *,
    request_id: str,
    conversation_title: str,
    graph_config_id: int | None,
    graph_config_name: str | None,
) -> None:
    title_llm = get_llm()
    prompt = PromptTemplate.from_template(
        "Summarize the following chat in a short 3-5 word title. Only respond with the title, nothing else. Chat:\nUser: {u}\nAssistant: {a}"
    )
    with ai_log_scope(
        request_id=request_id,
        conversation_id=conversation_id,
        conversation_title=conversation_title,
        graph_config_id=graph_config_id,
        graph_config_name=graph_config_name,
        node_name="title_generator",
        operation="conversation_title",
    ):
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
        completed_node_runs: list[NodeRun] = []
        persisted_messages: list[dict[str, object]] = []
        messages_persisted = False

        try:
            with ai_log_scope(
                request_id=request_id,
                conversation_id=conversation.id,
                conversation_title=conversation.title,
                graph_config_id=conversation.graph_config_id,
                graph_config_name=conversation.graph_config_name,
                operation="chat_stream",
            ):
                async with asyncio.timeout(CHAT_STREAM_TIMEOUT_SECONDS):
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
                    graph = get_graph(conversation.graph_config_id)
                    log_event(
                        "audit_graph_execution_started",
                        request_id=request_id,
                        conversation_id=conversation.id,
                        graph_name=graph.__class__.__name__,
                    )

                    async for stream_item in graph.astream(
                        {"messages": build_conversation_from_history(history)},
                        stream_mode=["messages", "updates"],
                    ):
                        await ensure_connected()
                        if (
                            isinstance(stream_item, tuple)
                            and len(stream_item) == 2
                            and isinstance(stream_item[0], str)
                            and stream_item[0] in {"messages", "updates"}
                        ):
                            stream_mode, stream_payload = stream_item
                        else:
                            stream_mode = "messages"
                            stream_payload = stream_item

                        if stream_mode == "messages":
                            chunk, metadata = cast(
                                tuple[AIMessageChunk, dict[str, Any]],
                                stream_payload,
                            )
                            node = metadata.get("langgraph_node")
                            if isinstance(node, str) and node not in {"__start__", "__end__"}:
                                text = extract_chunk_text(chunk)
                                if text:
                                    if node not in node_contents:
                                        node_contents[node] = []
                                        node_order.append(node)
                                    node_contents[node].append(text)
                                    await queue.put(
                                        sse_event("chunk", {"node": node, "text": text})
                                    )
                            continue

                        if stream_mode == "updates":
                            for node_run in _extract_node_runs(stream_payload):
                                completed_node_runs.append(node_run)
                                await queue.put(
                                    sse_event(
                                        "node_state",
                                        {"node_run": dict(node_run)},
                                    )
                                )

                    resolved_node_runs = completed_node_runs + _build_partial_node_runs(
                        completed_node_names={node_run["node"] for node_run in completed_node_runs},
                        node_order=node_order,
                        node_contents=node_contents,
                    )
                    final_messages = _persist_node_runs(
                        conversation.id,
                        node_runs=resolved_node_runs,
                    )
                    persisted_messages = final_messages
                    messages_persisted = True

                    if not final_messages:
                        saved_message = append_message(
                            conversation.id,
                            "assistant",
                            "模型返回了空响应。",
                            node="assistant",
                            node_label=get_node_label("assistant"),
                            state_patch={"final_output": "模型返回了空响应。"},
                        )
                        final_messages.append(_serialize_message(saved_message))
                        persisted_messages = final_messages

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
                        str(message["content"])
                        for message in final_messages
                        if message.get("content")
                    ).strip()
                    if assistant_text and (
                        conversation.title == "New chat"
                        or conversation.title == user_message.content.strip()[:48]
                    ):
                        asyncio.create_task(
                            _generate_conversation_title(
                                conversation.id,
                                user_message.content,
                                assistant_text,
                                request_id=request_id,
                                conversation_title=conversation.title,
                                graph_config_id=conversation.graph_config_id,
                                graph_config_name=conversation.graph_config_name,
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
            if not messages_persisted:
                persisted_messages = _persist_node_runs(
                    conversation.id,
                    node_runs=completed_node_runs
                    + _build_partial_node_runs(
                        completed_node_names={node_run["node"] for node_run in completed_node_runs},
                        node_order=node_order,
                        node_contents=node_contents,
                    ),
                )
                messages_persisted = True

            if persisted_messages:
                updated_conversation = get_conversation(conversation.id)
                await queue.put(
                    sse_event(
                        "done",
                        {
                            "messages": persisted_messages,
                            "conversation": updated_conversation.model_dump(),
                            "partial": True,
                            "warning": "生成时间较长，已返回当前已完成的内容。",
                        },
                    )
                )
                log_event(
                    "chat_stream_timeout_partial",
                    request_id=request_id,
                    conversation_id=conversation.id,
                    assistant_message_count=len(persisted_messages),
                )
            else:
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
    with ai_log_scope(request_id=request_id, operation="chat_request"):
        result = await get_graph().ainvoke({"messages": build_conversation(payload)})
    assistant_message = ChatMessage(
        role="assistant",
        content=resolve_final_output(cast(dict[str, Any], result)),
    )
    log_event("chat_request_completed", request_id=request_id)
    return ChatResponse(response=assistant_message.content, message=assistant_message)
