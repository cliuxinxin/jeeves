from __future__ import annotations

from typing import Mapping

from .graph_contracts import (
    PromptConfigField,
    get_graph_prompt_defaults,
    get_graph_prompt_field_definitions,
)
from .schemas import GraphType

LEGACY_PROMPT_FIELD_KEYS = (
    PromptConfigField.SYSTEM.value,
    PromptConfigField.ANALYZER.value,
    PromptConfigField.DECONSTRUCTOR.value,
)
PromptValues = dict[str, str]
PromptValuesCacheKey = tuple[tuple[str, str], ...]


def merge_legacy_prompt_inputs(
    *,
    prompt_values: Mapping[str, str] | None = None,
    system_prompt: str = "",
    analyzer_prompt: str = "",
    deconstructor_prompt: str = "",
) -> PromptValues:
    merged: PromptValues = {
        PromptConfigField.SYSTEM.value: system_prompt,
        PromptConfigField.ANALYZER.value: analyzer_prompt,
        PromptConfigField.DECONSTRUCTOR.value: deconstructor_prompt,
    }

    for key, value in (prompt_values or {}).items():
        if key in LEGACY_PROMPT_FIELD_KEYS and isinstance(value, str):
            merged[key] = value

    return merged


def build_prompt_values(
    *,
    graph_type: GraphType,
    prompt_values: Mapping[str, str] | None = None,
    system_prompt: str = "",
    analyzer_prompt: str = "",
    deconstructor_prompt: str = "",
) -> PromptValues:
    allowed_keys = {field.key for field in get_graph_prompt_field_definitions(graph_type)}
    merged = merge_legacy_prompt_inputs(
        prompt_values=prompt_values,
        system_prompt=system_prompt,
        analyzer_prompt=analyzer_prompt,
        deconstructor_prompt=deconstructor_prompt,
    )
    normalized: PromptValues = {}

    for key, value in merged.items():
        if key in allowed_keys and isinstance(value, str):
            normalized[key] = value

    for key, value in (prompt_values or {}).items():
        if key in allowed_keys and isinstance(value, str):
            normalized[key] = value

    return normalized


def resolve_prompt_values(
    *,
    graph_type: GraphType,
    prompt_values: Mapping[str, str] | None = None,
    system_prompt: str = "",
    analyzer_prompt: str = "",
    deconstructor_prompt: str = "",
) -> PromptValues:
    defaults = get_graph_prompt_defaults(graph_type)
    normalized = build_prompt_values(
        graph_type=graph_type,
        prompt_values=prompt_values,
        system_prompt=system_prompt,
        analyzer_prompt=analyzer_prompt,
        deconstructor_prompt=deconstructor_prompt,
    )
    legacy_values = merge_legacy_prompt_inputs(
        prompt_values=prompt_values,
        system_prompt=system_prompt,
        analyzer_prompt=analyzer_prompt,
        deconstructor_prompt=deconstructor_prompt,
    )
    allowed_keys = {field.key for field in get_graph_prompt_field_definitions(graph_type)}
    resolved: PromptValues = dict(normalized)

    resolved_system_prompt = (
        str(legacy_values.get(PromptConfigField.SYSTEM.value, "") or "")
        or defaults.default_system_prompt
    )
    resolved_analyzer_prompt = (
        str(normalized.get(PromptConfigField.ANALYZER.value, "") or "")
        or str(legacy_values.get(PromptConfigField.ANALYZER.value, "") or "")
        or defaults.default_analyzer_prompt
    )
    resolved_deconstructor_prompt = (
        str(normalized.get(PromptConfigField.DECONSTRUCTOR.value, "") or "")
        or str(legacy_values.get(PromptConfigField.DECONSTRUCTOR.value, "") or "")
        or defaults.default_deconstructor_prompt
        or (
            resolved_system_prompt if defaults.deconstructor_falls_back_to_system else ""
        )
    )

    if PromptConfigField.SYSTEM.value in allowed_keys:
        resolved[PromptConfigField.SYSTEM.value] = resolved_system_prompt
    if PromptConfigField.ANALYZER.value in allowed_keys:
        resolved[PromptConfigField.ANALYZER.value] = resolved_analyzer_prompt
    if PromptConfigField.DECONSTRUCTOR.value in allowed_keys:
        resolved[PromptConfigField.DECONSTRUCTOR.value] = resolved_deconstructor_prompt

    return resolved


def get_prompt_value(prompt_values: Mapping[str, str], key: str) -> str:
    return str(prompt_values.get(key, "") or "")


def prompt_values_cache_key(prompt_values: Mapping[str, str]) -> PromptValuesCacheKey:
    return tuple(sorted((str(key), str(value)) for key, value in prompt_values.items()))


def prompt_values_to_columns(prompt_values: Mapping[str, str]) -> tuple[str, str, str]:
    return (
        get_prompt_value(prompt_values, PromptConfigField.SYSTEM.value),
        get_prompt_value(prompt_values, PromptConfigField.ANALYZER.value),
        get_prompt_value(prompt_values, PromptConfigField.DECONSTRUCTOR.value),
    )
