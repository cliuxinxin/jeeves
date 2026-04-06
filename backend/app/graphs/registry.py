from __future__ import annotations

from functools import lru_cache

from ..schemas import GraphConfigRecord, GraphType
from .simple_chat import build_simple_chat_graph
from .summary_analysis import build_summary_analysis_graph

DEFAULT_ASSISTANT_SYSTEM_PROMPT = (
    "You are Jeeves, a polished AI assistant built with LangGraph. "
    "Be helpful, concise, and practical."
)

DEFAULT_ANALYZER_PROMPT = (
    "你是一个专业的文本分类器。请阅读用户输入，判定文章类型，并在结尾严格输出：【文章类型：XXX】。"
)


def resolve_graph_settings(
    active_config: GraphConfigRecord | None,
) -> tuple[GraphType, str, str, str]:
    if active_config is None:
        return (
            GraphType.SIMPLE_CHAT,
            DEFAULT_ASSISTANT_SYSTEM_PROMPT,
            "",
            "",
        )

    graph_type = active_config.graph_type
    system_prompt = active_config.system_prompt or DEFAULT_ASSISTANT_SYSTEM_PROMPT
    analyzer_prompt = active_config.analyzer_prompt or DEFAULT_ANALYZER_PROMPT
    deconstructor_prompt = active_config.deconstructor_prompt or system_prompt
    return graph_type, system_prompt, analyzer_prompt, deconstructor_prompt


@lru_cache(maxsize=16)
def compile_graph(
    graph_type: GraphType,
    system_prompt: str,
    analyzer_prompt: str,
    deconstructor_prompt: str,
):
    if graph_type == GraphType.SUMMARY_ANALYSIS:
        return build_summary_analysis_graph(
            analyzer_prompt=analyzer_prompt,
            deconstructor_prompt=deconstructor_prompt,
        )

    return build_simple_chat_graph(system_prompt=system_prompt)
