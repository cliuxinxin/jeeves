from dataclasses import dataclass

from langchain_openai import ChatOpenAI

from .config import get_settings
from .llm_config_store import get_active_llm_config_with_key
from .messages import from_langchain_message
from .schemas import LLMConfigTestRequest


@dataclass
class ResolvedLLMConfig:
    source: str
    name: str
    api_key: str
    model: str
    base_url: str | None
    temperature: float
    max_retries: int


def resolve_llm_config() -> ResolvedLLMConfig:
    active_row = get_active_llm_config_with_key()
    if active_row:
        return ResolvedLLMConfig(
            source="database",
            name=active_row["name"],
            api_key=active_row["api_key"],
            model=active_row["model"],
            base_url=active_row["base_url"],
            temperature=active_row["temperature"],
            max_retries=active_row["max_retries"],
        )

    settings = get_settings()
    if settings.openai_api_key:
        return ResolvedLLMConfig(
            source="environment",
            name="Environment",
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url,
            temperature=settings.openai_temperature,
            max_retries=settings.openai_max_retries,
        )

    raise RuntimeError("No active LLM config found. Create one in the configuration panel first.")


def build_chat_model(config: ResolvedLLMConfig) -> ChatOpenAI:
    llm_kwargs: dict[str, object] = {
        "api_key": config.api_key,
        "model": config.model,
        "temperature": config.temperature,
        "max_retries": config.max_retries,
    }

    if config.base_url:
        llm_kwargs["base_url"] = config.base_url

    return ChatOpenAI(**llm_kwargs)


def get_llm() -> ChatOpenAI:
    return build_chat_model(resolve_llm_config())


async def test_llm_config(payload: LLMConfigTestRequest) -> str:
    llm = build_chat_model(
        ResolvedLLMConfig(
            source="request",
            name="Test Config",
            api_key=payload.api_key,
            model=payload.model,
            base_url=payload.base_url,
            temperature=payload.temperature,
            max_retries=payload.max_retries,
        )
    )
    response = await llm.ainvoke("Reply with a short confirmation that the configuration works.")
    return from_langchain_message(response).content
