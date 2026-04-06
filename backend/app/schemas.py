from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str | None = Field(default=None, min_length=1)
    messages: list[ChatMessage] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_payload(self) -> "ChatRequest":
        if not self.message and not self.messages:
            raise ValueError("Provide either `message` or `messages`.")
        return self


class ChatResponse(BaseModel):
    response: str
    message: ChatMessage


class ChatStreamRequest(BaseModel):
    conversation_id: int
    message: str = Field(min_length=1)

    @field_validator("message", mode="before")
    @classmethod
    def strip_message(cls, value: str) -> str:
        return _strip_required(value)


def _strip_required(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("This field cannot be empty.")
    return cleaned


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class LLMConfigCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    api_key: str = Field(min_length=1)
    model: str = Field(min_length=1, max_length=120)
    base_url: str | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_retries: int = Field(default=2, ge=0, le=10)

    @field_validator("name", "api_key", "model", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("base_url", mode="before")
    @classmethod
    def strip_optional_strings(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class LLMConfigUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    api_key: str | None = None
    model: str = Field(min_length=1, max_length=120)
    base_url: str | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_retries: int = Field(default=2, ge=0, le=10)

    @field_validator("name", "model", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("api_key", "base_url", mode="before")
    @classmethod
    def strip_optional_strings(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class LLMConfigTestRequest(BaseModel):
    api_key: str = Field(min_length=1)
    model: str = Field(min_length=1, max_length=120)
    base_url: str | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_retries: int = Field(default=2, ge=0, le=10)

    @field_validator("api_key", "model", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("base_url", mode="before")
    @classmethod
    def strip_optional_strings(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class LLMConfigRecord(BaseModel):
    id: int
    name: str
    api_key_masked: str
    model: str
    base_url: str | None = None
    temperature: float
    max_retries: int
    is_active: bool
    created_at: str
    updated_at: str


class LLMConfigListResponse(BaseModel):
    items: list[LLMConfigRecord]
    active_config_id: int | None = None


class LLMConfigTestResponse(BaseModel):
    success: bool
    message: str
    response_preview: str | None = None


class HealthResponse(BaseModel):
    status: str
    configured: bool
    source: str | None = None
    config_name: str | None = None
    model: str | None = None
    max_retries: int | None = None


class ConversationRecord(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str


class ConversationSummary(ConversationRecord):
    preview: str = ""
    message_count: int = 0


class ConversationMessageRecord(BaseModel):
    id: int
    conversation_id: int
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: str


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary]


class ConversationDetailResponse(BaseModel):
    conversation: ConversationRecord
    messages: list[ConversationMessageRecord]


class GraphConfigCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    graph_type: str = Field(min_length=1, max_length=100)
    system_prompt: str = Field(default="")

    @field_validator("name", "graph_type", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)


class GraphConfigUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    graph_type: str = Field(min_length=1, max_length=100)
    system_prompt: str = Field(default="")

    @field_validator("name", "graph_type", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)


class GraphConfigRecord(BaseModel):
    id: int
    name: str
    graph_type: str
    system_prompt: str
    is_active: bool
    created_at: str
    updated_at: str


class GraphConfigListResponse(BaseModel):
    items: list[GraphConfigRecord]
    active_config_id: int | None = None

