from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)

from .schemas import ChatMessage, ChatRequest, ConversationMessageRecord


def build_conversation(payload: ChatRequest) -> list[BaseMessage]:
    messages = list(payload.messages)

    if payload.message:
        messages.append(ChatMessage(role="user", content=payload.message))

    return [to_langchain_message(message) for message in messages]


def build_conversation_from_history(messages: list[ConversationMessageRecord]) -> list[BaseMessage]:
    payload = ChatRequest(
        messages=[ChatMessage(role=message.role, content=message.content) for message in messages]
    )
    return build_conversation(payload)


def to_langchain_message(message: ChatMessage) -> BaseMessage:
    if message.role == "user":
        return HumanMessage(content=message.content)
    if message.role == "assistant":
        return AIMessage(content=message.content)
    return SystemMessage(content=message.content)


def from_langchain_message(message: BaseMessage) -> ChatMessage:
    role = {
        "human": "user",
        "ai": "assistant",
        "system": "system",
    }.get(message.type, "assistant")

    content = extract_text_content(message.content)
    return ChatMessage(role=role, content=content or "模型返回了空响应。")


def extract_text_content(content: str | list[object], *, strip: bool = True) -> str:
    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(str(item.get("text", "")))
        joined = "\n".join(part for part in text_parts if part) if strip else "".join(text_parts)
        return joined.strip() if strip else joined

    text = str(content)
    return text.strip() if strip else text


def extract_chunk_text(chunk: AIMessageChunk) -> str:
    # Preserve chunk whitespace so streamed Markdown keeps its headings,
    # list boundaries, and code fences intact when pieces are concatenated.
    return extract_text_content(chunk.content, strip=False)
