from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx
import openai
from langchain_openai import ChatOpenAI
from tenacity import (
    AsyncRetrying,
    RetryCallState,
    Retrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from .config import get_settings
from .messages import from_langchain_message
from .repositories.llm_configs import get_active_llm_config_with_key
from .schemas import LLMConfigTestRequest
from .telemetry import log_event


@dataclass(frozen=True)
class ResolvedLLMConfig:
    source: str
    name: str
    api_key: str
    model: str
    base_url: str | None
    temperature: float
    max_retries: int


_RETRYABLE_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}
_RETRYABLE_ERROR_MARKERS = (
    "too many requests",
    "rate limit",
    "rate-limit",
    "temporarily rate-limited",
    "error code: 429",
    "'code': 429",
    '"code": 429',
)


def _extract_status_code(exc: BaseException) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code

    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    if isinstance(response_status, int):
        return response_status

    return None


def _is_retryable_llm_error(exc: BaseException) -> bool:
    if isinstance(
        exc,
        (
            openai.RateLimitError,
            openai.APIConnectionError,
            openai.APITimeoutError,
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.RemoteProtocolError,
        ),
    ):
        return True

    status_code = _extract_status_code(exc)
    if status_code in _RETRYABLE_STATUS_CODES:
        return True

    message = str(exc).lower()
    return any(marker in message for marker in _RETRYABLE_ERROR_MARKERS)


def _log_retry(retry_state: RetryCallState) -> None:
    if retry_state.outcome is None or retry_state.outcome.failed is False:
        return
    exception = retry_state.outcome.exception()
    log_event(
        "llm_retry",
        attempt=retry_state.attempt_number,
        error=str(exception) if exception else None,
        status_code=_extract_status_code(exception) if exception else None,
    )


class RetryingChatModel:
    def __init__(self, inner: ChatOpenAI, max_retries: int) -> None:
        self._inner = inner
        self._attempts = max(1, max_retries + 1)

    async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:
        async for attempt in AsyncRetrying(
            retry=retry_if_exception(_is_retryable_llm_error),
            wait=wait_exponential(multiplier=1, min=2, max=12),
            stop=stop_after_attempt(self._attempts),
            before_sleep=_log_retry,
            reraise=True,
        ):
            with attempt:
                return await self._inner.ainvoke(*args, **kwargs)

        raise RuntimeError("LLM async invocation ended unexpectedly.")

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        for attempt in Retrying(
            retry=retry_if_exception(_is_retryable_llm_error),
            wait=wait_exponential(multiplier=1, min=2, max=12),
            stop=stop_after_attempt(self._attempts),
            before_sleep=_log_retry,
            reraise=True,
        ):
            with attempt:
                return self._inner.invoke(*args, **kwargs)

        raise RuntimeError("LLM invocation ended unexpectedly.")

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


@lru_cache(maxsize=32)
def _resolved_db_config(
    name: str,
    api_key: str,
    model: str,
    base_url: str | None,
    temperature: float,
    max_retries: int,
) -> ResolvedLLMConfig:
    return ResolvedLLMConfig(
        source="database",
        name=name,
        api_key=api_key,
        model=model,
        base_url=base_url,
        temperature=temperature,
        max_retries=max_retries,
    )


@lru_cache(maxsize=1)
def _resolved_environment_config(
    api_key: str,
    model: str,
    base_url: str | None,
    temperature: float,
    max_retries: int,
) -> ResolvedLLMConfig:
    return ResolvedLLMConfig(
        source="environment",
        name="Environment",
        api_key=api_key,
        model=model,
        base_url=base_url,
        temperature=temperature,
        max_retries=max_retries,
    )


def resolve_llm_config() -> ResolvedLLMConfig:
    active_row = get_active_llm_config_with_key()
    if active_row:
        return _resolved_db_config(
            str(active_row["name"]),
            str(active_row["api_key"]),
            str(active_row["model"]),
            str(active_row["base_url"]) if active_row["base_url"] else None,
            float(active_row["temperature"]),
            int(active_row["max_retries"]),
        )

    settings = get_settings()
    if settings.openai_api_key:
        return _resolved_environment_config(
            settings.openai_api_key,
            settings.openai_model,
            settings.openai_base_url,
            settings.openai_temperature,
            settings.openai_max_retries,
        )

    raise RuntimeError("No active LLM config found. Create one in the configuration panel first.")


@lru_cache(maxsize=32)
def _build_chat_model(
    api_key: str,
    model: str,
    base_url: str | None,
    temperature: float,
    max_retries: int,
) -> RetryingChatModel:
    llm_kwargs: dict[str, object] = {
        "api_key": api_key,
        "model": model,
        "temperature": temperature,
        "max_retries": 0,
    }

    if base_url:
        llm_kwargs["base_url"] = base_url

    return RetryingChatModel(ChatOpenAI(**llm_kwargs), max_retries=max_retries)


def build_chat_model(config: ResolvedLLMConfig) -> RetryingChatModel:
    return _build_chat_model(
        config.api_key,
        config.model,
        config.base_url,
        config.temperature,
        config.max_retries,
    )


def get_llm() -> RetryingChatModel:
    return build_chat_model(resolve_llm_config())


def invalidate_llm_caches() -> None:
    _resolved_db_config.cache_clear()
    _resolved_environment_config.cache_clear()
    _build_chat_model.cache_clear()


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
