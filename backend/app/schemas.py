from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class GraphType(str, Enum):
    SIMPLE_CHAT = "simple_chat"
    SUMMARY_ANALYSIS = "summary_analysis"
    VIRAL_TWEET = "viral_tweet"
    ARTICLE_VALUE = "article_value"


class AILogStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"


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


class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)

    @field_validator("username", "password", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)


class AuthSessionResponse(BaseModel):
    authenticated: bool
    username: str | None = None


class ConversationRecord(BaseModel):
    id: int
    title: str
    graph_config_id: int | None = None
    graph_config_name: str | None = None
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
    node: str | None = None
    node_label: str | None = None
    state_patch: dict[str, str] = Field(default_factory=dict)
    created_at: str


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary]


class ConversationDetailResponse(BaseModel):
    conversation: ConversationRecord
    messages: list[ConversationMessageRecord]


class ConversationCreateRequest(BaseModel):
    title: str = Field(default="New chat", min_length=1, max_length=200)
    graph_config_id: int | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return _strip_required(value)


class ConversationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    graph_config_id: int | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_optional_title(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class LikedCardCreateRequest(BaseModel):
    conversation_id: int = Field(ge=1)
    source_message_id: int = Field(ge=1)
    card_index: int = Field(ge=1)
    route_label: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)

    @field_validator("title", "content", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("route_label", mode="before")
    @classmethod
    def strip_optional_route_label(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class LikedCardRecord(BaseModel):
    id: int
    conversation_id: int
    conversation_title: str | None = None
    graph_config_id: int | None = None
    graph_config_name: str | None = None
    graph_type: str | None = None
    source_message_id: int
    source_request_id: str | None = None
    source_node_name: str | None = None
    source_node_label: str | None = None
    source_state_patch: dict[str, Any] = Field(default_factory=dict)
    card_index: int
    route_label: str | None = None
    title: str
    content: str
    workflow_snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class LikedCardListResponse(BaseModel):
    items: list[LikedCardRecord]


class GraphConfigCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    graph_type: GraphType
    system_prompt: str = Field(default="")
    analyzer_prompt: str = Field(default="")
    deconstructor_prompt: str = Field(default="")
    prompt_values: dict[str, str] = Field(default_factory=dict)

    @field_validator("name", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)


class GraphConfigUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    graph_type: GraphType
    system_prompt: str = Field(default="")
    analyzer_prompt: str = Field(default="")
    deconstructor_prompt: str = Field(default="")
    prompt_values: dict[str, str] = Field(default_factory=dict)

    @field_validator("name", mode="before")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        return _strip_required(value)


class GraphConfigRecord(BaseModel):
    id: int
    name: str
    graph_type: GraphType
    system_prompt: str
    analyzer_prompt: str = ""
    deconstructor_prompt: str = ""
    prompt_values: dict[str, str] = Field(default_factory=dict)
    is_active: bool
    created_at: str
    updated_at: str


class GraphConfigListResponse(BaseModel):
    items: list[GraphConfigRecord]
    active_config_id: int | None = None


class GraphPromptPreviewRequest(BaseModel):
    graph_type: GraphType
    system_prompt: str = Field(default="")
    analyzer_prompt: str = Field(default="")
    deconstructor_prompt: str = Field(default="")
    prompt_values: dict[str, str] = Field(default_factory=dict)


class GraphNodePromptPreview(BaseModel):
    node: str
    node_label: str
    purpose: str
    reads: list[str] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)
    prompt_source: str
    prompt_preview: str


class GraphStateSlotPreview(BaseModel):
    name: str
    label: str
    description: str
    kind: str
    written_by: list[str] = Field(default_factory=list)
    read_by: list[str] = Field(default_factory=list)


class GraphPromptFieldPreview(BaseModel):
    key: str
    label: str
    description: str
    placeholder: str


class GraphPromptPreviewResponse(BaseModel):
    items: list[GraphNodePromptPreview]
    state_slots: list[GraphStateSlotPreview] = Field(default_factory=list)
    prompt_fields: list[GraphPromptFieldPreview] = Field(default_factory=list)


class AILogMessage(BaseModel):
    role: str
    content: str


class AILogRecord(BaseModel):
    id: int
    request_id: str
    conversation_id: int | None = None
    conversation_title: str | None = None
    graph_config_id: int | None = None
    graph_config_name: str | None = None
    node_name: str | None = None
    node_label: str | None = None
    operation: str | None = None
    llm_source: str | None = None
    llm_config_name: str | None = None
    model: str | None = None
    status: AILogStatus
    attempt_count: int
    duration_ms: float
    input_messages: list[AILogMessage] = Field(default_factory=list)
    response_text: str | None = None
    error_message: str | None = None
    created_at: str


class AILogListResponse(BaseModel):
    items: list[AILogRecord]
