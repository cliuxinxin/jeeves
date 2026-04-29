from __future__ import annotations

import re
from typing import Mapping, TypedDict

from .graph_contracts import (
    NodeContract,
    PromptTemplateKind,
    TARGET_STUDENT_PROFILE_KEY,
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
    DEFAULT_PARENT_VERIFICATION_PROMPT,
    DEFAULT_SINGLE_QUESTION_DIAGNOSER_PROMPT,
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
        return "framework,contrarian"
    return ",".join(value_routes)


def _describe_value_routes(value_routes: list[str]) -> str:
    descriptions = []
    for route in value_routes:
        label = VALUE_ROUTE_LABELS.get(route, route)
        guide = VALUE_ROUTE_GUIDES.get(route, "提炼这篇文章真正值得拿走的价值。")
        descriptions.append(f"- {label}（{route}）：{guide}")
    return "\n".join(descriptions)


def build_article_value_brief(value_routes: list[str], route_reason: str) -> str:
    routes = value_routes or ["framework", "contrarian"]
    reason = route_reason or "请围绕最值得拿走的价值，优先输出最能被复用、转述或直接拿去行动的判断。"
    return (
        "价值路由信息：\n"
        f"- 已选路由：{_format_value_routes(routes)}\n"
        f"- 路由理由：{reason}\n\n"
        "各路由关注重点：\n"
        f"{_describe_value_routes(routes)}\n\n"
        "写作提醒：\n"
        "1. 只围绕最强的 2 到 4 个洞察写卡片，不要机械覆盖所有路由。\n"
        "2. 优先顺序是 framework > contrarian > opportunity；signal、risk、expression 只在文章主轴明显匹配时使用。\n"
        "3. 每张卡片都要给出具体判断，并尽量贴近原文事实、案例、数字、工具或流程。\n"
        "4. 每张卡片必须明确绑定到 1 个已选路由；如果某条路由价值不足，宁可不用。\n"
        "5. 正文中每张卡片必须使用 `### 卡片 1：市场信号：短标题` 这种 Markdown 小标题，数字统一用阿拉伯数字。\n"
        "6. 标题尽量控制在 12 到 22 个字，直接写判断，必要时可以稍长，但不要写成需要读完正文才能理解的抽象比喻。\n"
        "7. 卡片顺序尽量按路由分组，相邻卡片不要频繁切换视角。"
    )


def _build_target_student_profile_section(target_student_profile: str) -> str:
    profile = (target_student_profile or "").strip()
    if not profile:
        return (
            "针对对象背景：\n"
            "- 当前未额外填写长期背景，请只依据这次具体错题与家长描述做排查。\n"
            "- 不要擅自推断孩子的长期能力水平。"
        )

    return (
        "针对对象背景：\n"
        f"{profile}\n\n"
        "使用提醒：\n"
        "1. 这些背景只作为理解孩子表达和常见卡点的参考。\n"
        "2. 本次判断仍然必须优先围绕这道具体题本身展开。\n"
        "3. 不要因为历史卡点就忽略题目当下的信息。"
    )


def build_single_question_diagnosis_brief(
    diagnosis_tags: list[str],
    diagnosis_summary: str,
) -> str:
    tags = diagnosis_tags or ["题意理解偏差", "概念理解断点"]
    summary = (
        diagnosis_summary.strip()
        if diagnosis_summary.strip()
        else "目前还没有明确结论，请围绕这道题继续排查孩子究竟卡在理解、步骤还是表达映射。"
    )
    return (
        "阶段 1 初步排查摘要：\n"
        f"- 排查标签：{'、'.join(tags)}\n"
        f"- 摘要：{summary}\n\n"
        "阶段 2 协作要求：\n"
        "1. 问题要短，一次只验证一个方向。\n"
        "2. 优先用口头追问，而不是重新出整道新题。\n"
        "3. 让家长能根据孩子回答继续追问，而不是只得到对错。"
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


def compile_single_question_diagnoser_prompt(
    base_system_prompt: str,
    *,
    target_student_profile: str,
) -> str:
    system_prompt = (base_system_prompt or "").strip() or DEFAULT_SINGLE_QUESTION_DIAGNOSER_PROMPT
    profile_section = _build_target_student_profile_section(target_student_profile)
    return f"{system_prompt}\n\n{profile_section}"


def compile_parent_verifier_prompt(
    base_system_prompt: str,
    *,
    target_student_profile: str,
    diagnosis_tags: list[str],
    diagnosis_summary: str,
) -> str:
    system_prompt = (base_system_prompt or "").strip() or DEFAULT_PARENT_VERIFICATION_PROMPT
    profile_section = _build_target_student_profile_section(target_student_profile)
    diagnosis_brief = build_single_question_diagnosis_brief(diagnosis_tags, diagnosis_summary)
    return f"{system_prompt}\n\n{profile_section}\n\n{diagnosis_brief}"


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
    diagnosis_tags: list[str],
    diagnosis_summary: str,
) -> str:
    base_prompt = get_prompt_value(prompt_values, contract.prompt_config_key)
    target_student_profile = get_prompt_value(prompt_values, TARGET_STUDENT_PROFILE_KEY)

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

    if contract.prompt_kind == PromptTemplateKind.SINGLE_QUESTION_DIAGNOSER:
        return compile_single_question_diagnoser_prompt(
            base_prompt,
            target_student_profile=target_student_profile,
        )

    if contract.prompt_kind == PromptTemplateKind.PARENT_VERIFIER:
        return compile_parent_verifier_prompt(
            base_prompt,
            target_student_profile=target_student_profile,
            diagnosis_tags=diagnosis_tags,
            diagnosis_summary=diagnosis_summary,
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
                    diagnosis_tags=["{{diagnosis_tags}}"],
                    diagnosis_summary="{{diagnosis_summary}}",
                ),
            )
        )
    return previews
