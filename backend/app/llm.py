from dataclasses import dataclass
from functools import lru_cache
from time import perf_counter
from typing import Any

import httpx
import openai
from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from tenacity import (
    AsyncRetrying,
    RetryCallState,
    Retrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from .ai_logging import ai_log_scope, get_ai_log_context
from .config import get_settings
from .messages import extract_text_content, from_langchain_message
from .repositories.ai_logs import create_ai_log
from .repositories.llm_configs import get_active_llm_config_with_key
from .schemas import AILogStatus, LLMConfigTestRequest
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
    def __init__(
        self,
        inner: ChatOpenAI,
        max_retries: int,
        *,
        config_name: str,
        model: str,
        source: str,
    ) -> None:
        self._inner = inner
        self._attempts = max(1, max_retries + 1)
        self._config_name = config_name
        self._model = model
        self._source = source

    def _serialize_input_messages(self, *args: Any, **kwargs: Any) -> list[dict[str, str]]:
        raw_input = args[0] if args else kwargs.get("input")
        if raw_input is None:
            return []

        if isinstance(raw_input, list):
            return [self._serialize_single_message(item) for item in raw_input]

        return [self._serialize_single_message(raw_input)]

    def _serialize_single_message(self, value: Any) -> dict[str, str]:
        if isinstance(value, BaseMessage):
            normalized = from_langchain_message(value)
            return {"role": normalized.role, "content": normalized.content}

        if hasattr(value, "content"):
            return {
                "role": getattr(value, "type", "message"),
                "content": extract_text_content(getattr(value, "content", "")),
            }

        return {"role": "input", "content": extract_text_content(value)}

    def _serialize_response_text(self, response: Any) -> str:
        if isinstance(response, BaseMessage):
            return from_langchain_message(response).content

        if hasattr(response, "content"):
            return extract_text_content(getattr(response, "content", ""))

        return extract_text_content(response)

    def _persist_ai_log(
        self,
        *,
        status: AILogStatus,
        attempt_count: int,
        duration_ms: float,
        input_messages: list[dict[str, str]],
        response_text: str | None,
        error_message: str | None,
    ) -> None:
        context = get_ai_log_context()
        try:
            create_ai_log(
                request_id=context.request_id,
                conversation_id=context.conversation_id,
                conversation_title=context.conversation_title,
                graph_config_id=context.graph_config_id,
                graph_config_name=context.graph_config_name,
                node_name=context.node_name,
                operation=context.operation,
                llm_source=self._source,
                llm_config_name=self._config_name,
                model=self._model,
                status=status,
                attempt_count=attempt_count,
                duration_ms=duration_ms,
                input_messages=input_messages,
                response_text=response_text,
                error_message=error_message,
            )
        except Exception as exc:
            log_event(
                "ai_log_persist_failed",
                request_id=context.request_id,
                error=str(exc),
                node_name=context.node_name,
            )

    async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:
        started_at = perf_counter()
        input_messages = self._serialize_input_messages(*args, **kwargs)
        attempt_count = 0

        try:
            response = None
            async for attempt in AsyncRetrying(
                retry=retry_if_exception(_is_retryable_llm_error),
                wait=wait_exponential(multiplier=1, min=2, max=12),
                stop=stop_after_attempt(self._attempts),
                before_sleep=_log_retry,
                reraise=True,
            ):
                attempt_count = attempt.retry_state.attempt_number
                with attempt:
                    response = await self._inner.ainvoke(*args, **kwargs)
                break

            if response is None:
                raise RuntimeError("LLM async invocation ended unexpectedly.")

            self._persist_ai_log(
                status=AILogStatus.SUCCESS,
                attempt_count=attempt_count or 1,
                duration_ms=round((perf_counter() - started_at) * 1000, 2),
                input_messages=input_messages,
                response_text=self._serialize_response_text(response),
                error_message=None,
            )
            return response
        except Exception as exc:
            self._persist_ai_log(
                status=AILogStatus.ERROR,
                attempt_count=max(1, attempt_count),
                duration_ms=round((perf_counter() - started_at) * 1000, 2),
                input_messages=input_messages,
                response_text=None,
                error_message=str(exc),
            )
            raise

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        started_at = perf_counter()
        input_messages = self._serialize_input_messages(*args, **kwargs)
        attempt_count = 0

        try:
            response = None
            for attempt in Retrying(
                retry=retry_if_exception(_is_retryable_llm_error),
                wait=wait_exponential(multiplier=1, min=2, max=12),
                stop=stop_after_attempt(self._attempts),
                before_sleep=_log_retry,
                reraise=True,
            ):
                attempt_count = attempt.retry_state.attempt_number
                with attempt:
                    response = self._inner.invoke(*args, **kwargs)
                break

            if response is None:
                raise RuntimeError("LLM invocation ended unexpectedly.")

            self._persist_ai_log(
                status=AILogStatus.SUCCESS,
                attempt_count=attempt_count or 1,
                duration_ms=round((perf_counter() - started_at) * 1000, 2),
                input_messages=input_messages,
                response_text=self._serialize_response_text(response),
                error_message=None,
            )
            return response
        except Exception as exc:
            self._persist_ai_log(
                status=AILogStatus.ERROR,
                attempt_count=max(1, attempt_count),
                duration_ms=round((perf_counter() - started_at) * 1000, 2),
                input_messages=input_messages,
                response_text=None,
                error_message=str(exc),
            )
            raise

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
    source: str,
    config_name: str,
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

    return RetryingChatModel(
        ChatOpenAI(**llm_kwargs),
        max_retries=max_retries,
        config_name=config_name,
        model=model,
        source=source,
    )


def build_chat_model(config: ResolvedLLMConfig) -> RetryingChatModel:
    return _build_chat_model(
        config.source,
        config.name,
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
    with ai_log_scope(node_name="llm_test", operation="llm_config_test"):
        response = await llm.ainvoke("Reply with a short confirmation that the configuration works.")
    return from_langchain_message(response).content
