from __future__ import annotations

import re
from typing import Mapping, TypedDict

from .graph_contracts import (
    NodeContract,
    PromptTemplateKind,
    get_graph_node_contracts,
)
from .graph_prompt_values import get_prompt_value
from .prompt_defaults import (
    DECONSTRUCTOR_MARKDOWN_GUIDE,
    DECONSTRUCTOR_PROFESSIONAL_GUIDE,
    DEFAULT_ANALYZER_PROMPT,
    DEFAULT_ARTICLE_VALUE_CARDS_PROMPT,
    DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT,
    DEFAULT_ASSISTANT_SYSTEM_PROMPT,
    DEFAULT_VIRAL_TWEET_STRATEGIST_PROMPT,
    DEFAULT_VIRAL_TWEET_WRITER_PROMPT,
    TYPE_FOCUS_MAP,
    VALUE_ROUTE_GUIDES,
    VALUE_ROUTE_LABELS,
)
from .schemas import GraphType


class NodePromptPreview(TypedDict):
    node: str
    node_label: str
    purpose: str
    reads: list[str]
    writes: list[str]
    prompt_source: str
    prompt_preview: str


def _focus_areas_for_article_type(article_type: str) -> list[str]:
    return TYPE_FOCUS_MAP.get(article_type, TYPE_FOCUS_MAP["综合文章"])


def build_summary_routing_brief(article_type: str, classification_reason: str) -> str:
    focus_areas = "、".join(_focus_areas_for_article_type(article_type))
    reason = classification_reason or f"文本的表达重心更接近“{article_type}”。"
    return (
        "二阶段路由信息：\n"
        f"- 文章类型：{article_type}\n"
        f"- 分类依据：{reason}\n"
        f"- 建议优先拆解：{focus_areas}\n\n"
        "协作要求：\n"
        "1. 将以上路由信息视为拆解优先级参考，不要机械复述。\n"
        "2. 若路由信息与原文细节冲突，以原文事实为准。\n"
        "3. 输出时优先提供对读者真正有用的判断、风险和价值。"
    )


def _build_viral_writer_brief(viral_axis: str, strategy_text: str) -> str:
    condensed_strategy = re.sub(
        r"\s*【传播主轴[:：]\s*.*?】\s*$", "", strategy_text, flags=re.S
    ).strip()
    if len(condensed_strategy) > 500:
        condensed_strategy = condensed_strategy[:497].rstrip() + "..."

    return (
        "推文策略上下文：\n"
        f"- 传播主轴：{viral_axis}\n"
        f"- 策略摘要：{condensed_strategy or '未提取到明确策略，请基于用户输入自行判断。'}\n\n"
        "协作要求：\n"
        "1. 优先放大最能引发转发/收藏/讨论的那个角度。\n"
        "2. 允许保留克制感，不要为了耸动而失真。\n"
        "3. 如果用户给了资料，必须优先使用资料中的具体信息。\n"
        "4. 如果资料不足，要让文案像高质量判断，而不是像瞎编。"
    )


def _format_value_routes(value_routes: list[str]) -> str:
    if not value_routes:
        return "signal,framework"
    return ",".join(value_routes)


def _describe_value_routes(value_routes: list[str]) -> str:
    descriptions = []
    for route in value_routes:
        label = VALUE_ROUTE_LABELS.get(route, route)
        guide = VALUE_ROUTE_GUIDES.get(route, "提炼这篇文章真正值得拿走的价值。")
        descriptions.append(f"- {label}（{route}）：{guide}")
    return "\n".join(descriptions)


def build_article_value_brief(value_routes: list[str], route_reason: str) -> str:
    routes = value_routes or ["signal", "framework"]
    reason = route_reason or "请围绕最值得拿走的价值，优先输出最值得复用或继续追踪的信息。"
    return (
        "价值路由信息：\n"
        f"- 已选路由：{_format_value_routes(routes)}\n"
        f"- 路由理由：{reason}\n\n"
        "各路由关注重点：\n"
        f"{_describe_value_routes(routes)}\n\n"
        "卡片生成要求：\n"
        "1. 只围绕最有价值的角度输出 2 到 4 张卡片，不要机械覆盖所有路由。\n"
        "2. 每张卡片都要给出具体判断，并尽量贴近原文事实或例子。\n"
        "3. 不要写成标准总结报告，而要写成“这篇文章最值得拿走什么”。\n"
        "4. 如果某条路由价值不足，可以合并到更强的卡片里。"
    )


def compile_assistant_prompt(base_system_prompt: str) -> str:
    return (base_system_prompt or "").strip() or DEFAULT_ASSISTANT_SYSTEM_PROMPT


def compile_summary_analyzer_prompt(base_system_prompt: str) -> str:
    return (base_system_prompt or "").strip() or DEFAULT_ANALYZER_PROMPT


def compile_summary_deconstructor_prompt(
    base_system_prompt: str,
    *,
    article_type: str,
    classification_reason: str,
) -> str:
    system_prompt = (base_system_prompt or "").strip()
    if not system_prompt:
        system_prompt = "请根据用户输入做拆解分析，条理清晰，分点输出。"

    system_prompt = system_prompt.replace("{article_type}", article_type)
    routing_brief = build_summary_routing_brief(article_type, classification_reason)
    return (
        f"{system_prompt}\n\n"
        f"{routing_brief}\n\n"
        f"{DECONSTRUCTOR_MARKDOWN_GUIDE}\n\n"
        f"{DECONSTRUCTOR_PROFESSIONAL_GUIDE}"
    )


def compile_viral_strategist_prompt(base_system_prompt: str) -> str:
    return (base_system_prompt or "").strip() or DEFAULT_VIRAL_TWEET_STRATEGIST_PROMPT


def compile_viral_writer_prompt(
    base_system_prompt: str,
    *,
    viral_axis: str,
    strategy_text: str,
) -> str:
    system_prompt = (base_system_prompt or "").strip() or DEFAULT_VIRAL_TWEET_WRITER_PROMPT
    strategy_brief = _build_viral_writer_brief(viral_axis, strategy_text)
    return f"{system_prompt}\n\n{strategy_brief}"


def compile_article_value_router_prompt(base_system_prompt: str) -> str:
    return (base_system_prompt or "").strip() or DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT


def compile_article_value_cards_prompt(
    base_system_prompt: str,
    *,
    value_routes: list[str],
    route_reason: str,
) -> str:
    system_prompt = (base_system_prompt or "").strip() or DEFAULT_ARTICLE_VALUE_CARDS_PROMPT
    value_brief = build_article_value_brief(value_routes, route_reason)
    return f"{system_prompt}\n\n{value_brief}"


def compile_prompt_for_contract(
    contract: NodeContract,
    *,
    prompt_values: Mapping[str, str],
    article_type: str,
    classification_reason: str,
    viral_axis: str,
    strategy_text: str,
    value_routes: list[str],
    route_reason: str,
) -> str:
    base_prompt = get_prompt_value(prompt_values, contract.prompt_config_key)

    if contract.prompt_kind == PromptTemplateKind.ASSISTANT:
        return compile_assistant_prompt(base_prompt)

    if contract.prompt_kind == PromptTemplateKind.SUMMARY_ANALYZER:
        return compile_summary_analyzer_prompt(base_prompt)

    if contract.prompt_kind == PromptTemplateKind.SUMMARY_DECONSTRUCTOR:
        return compile_summary_deconstructor_prompt(
            base_prompt,
            article_type=article_type,
            classification_reason=classification_reason,
        )

    if contract.prompt_kind == PromptTemplateKind.VIRAL_STRATEGIST:
        return compile_viral_strategist_prompt(base_prompt)

    if contract.prompt_kind == PromptTemplateKind.VIRAL_WRITER:
        return compile_viral_writer_prompt(
            base_prompt,
            viral_axis=viral_axis,
            strategy_text=strategy_text,
        )

    if contract.prompt_kind == PromptTemplateKind.ARTICLE_VALUE_ROUTER:
        return compile_article_value_router_prompt(base_prompt)

    if contract.prompt_kind == PromptTemplateKind.ARTICLE_VALUE_CARDS:
        return compile_article_value_cards_prompt(
            base_prompt,
            value_routes=value_routes,
            route_reason=route_reason,
        )

    raise ValueError(f"Unsupported prompt kind: {contract.prompt_kind}")


def build_graph_prompt_previews(
    *,
    graph_type: GraphType,
    prompt_values: Mapping[str, str],
) -> list[NodePromptPreview]:
    previews: list[NodePromptPreview] = []
    for contract in get_graph_node_contracts(graph_type):
        previews.append(
            NodePromptPreview(
                node=contract.node,
                node_label=contract.label,
                purpose=contract.purpose,
                reads=list(contract.reads),
                writes=list(contract.writes),
                prompt_source=contract.prompt_config_key,
                prompt_preview=compile_prompt_for_contract(
                    contract,
                    prompt_values=prompt_values,
                    article_type="{{article_type}}",
                    classification_reason="{{classification_reason}}",
                    viral_axis="{{viral_axis}}",
                    strategy_text="{{strategy_text}}",
                    value_routes=["{{value_routes}}"],
                    route_reason="{{route_reason}}",
                ),
            )
        )
    return previews
