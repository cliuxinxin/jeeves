from __future__ import annotations

from functools import lru_cache

from ..graph_prompt_values import (
    PromptValues,
    resolve_prompt_values,
)
from ..schemas import GraphConfigRecord, GraphType
from .pipeline import build_pipeline_graph


def resolve_graph_settings(
    active_config: GraphConfigRecord | None,
) -> tuple[GraphType, PromptValues]:
    if active_config is None:
        graph_type = GraphType.SIMPLE_CHAT
        return (
            graph_type,
            resolve_prompt_values(graph_type=graph_type),
        )

    graph_type = active_config.graph_type
    prompt_values = resolve_prompt_values(
        graph_type=graph_type,
        prompt_values=active_config.prompt_values,
        system_prompt=active_config.system_prompt,
        analyzer_prompt=active_config.analyzer_prompt,
        deconstructor_prompt=active_config.deconstructor_prompt,
    )
    return graph_type, prompt_values


@lru_cache(maxsize=16)
def compile_graph(
    graph_type: GraphType,
    prompt_values_key: tuple[tuple[str, str], ...],
):
    return build_pipeline_graph(
        graph_type=graph_type,
        prompt_values=dict(prompt_values_key),
    )
