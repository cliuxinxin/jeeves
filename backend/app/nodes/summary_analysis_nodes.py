import re
from typing import Any

import httpx
from langchain_core.exceptions import OutputParserException
from langchain_core.messages import AIMessage, SystemMessage
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..llm import get_llm

TYPE_FOCUS_MAP = {
    "健康科普/公共安全新闻": [
        "潜在风险",
        "成因或致病原理",
        "预防措施",
        "急救或应对建议",
        "易忽视的注意事项",
    ],
    "财经/商业新闻": [
        "核心经营数据",
        "市场竞争影响",
        "投资风险提示",
        "后续趋势判断",
        "对行业格局的意义",
    ],
    "科技/互联网新闻": ["核心技术创新点", "应用场景", "行业落地价值", "技术局限性", "未来演进方向"],
    "政策/时事新闻": ["政策背景", "核心条款解读", "受影响群体", "执行要求", "现实影响与约束"],
    "教程/操作指南": ["前置条件", "核心步骤逻辑", "关键配置项", "常见报错排查", "最佳实践建议"],
    "综合文章": ["核心观点", "支撑事实", "逻辑结构", "风险或争议点", "总结性建议"],
}


DECONSTRUCTOR_MARKDOWN_GUIDE = """
输出排版要求（必须遵守）：
1. 全文使用规范 Markdown。
2. 开头使用一个 `##` 总标题，不要使用 `#` 一级标题。
3. 后续分节统一使用 `###` 小标题。
4. 标题、段落、列表、代码块之间必须空一行。
5. 列表统一使用 `- `，不要使用 `·`、`•` 或把多个要点挤在同一段。
6. 每个段落控制在 2-3 句内，每个列表项控制在 1-2 句内。
7. 仅对命令、字段、路径、产品名使用反引号，不要整段加粗。
8. 不要把标题或列表标记接在正文同一行。
""".strip()

DECONSTRUCTOR_PROFESSIONAL_GUIDE = """
专业分析增强要求：
1. 先输出 `## 核心结论`，用 2-3 条列表提炼最重要的信息。
2. 再输出 `## 关键信号`，尽量区分“事实信息 / 分析判断 / 风险与不确定性”。
3. 然后进入 `## 深度拆解`，结合文章类型使用 `###` 小标题展开。
4. 结尾输出 `## 信息价值`，说明这篇文章对读者、业务、行业或执行层面的实际意义。
5. 如果原文信息不足，不要硬推断，明确写出“原文未提供”。
""".strip()


def _guess_article_type(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return "综合文本"

    keywords = [
        (
            "健康科普/公共安全新闻",
            [
                "寄生虫",
                "蜱虫",
                "咬伤",
                "发热",
                "皮疹",
                "病毒",
                "细菌",
                "病",
                "急救",
                "防护",
                "疾控",
            ],
        ),
        (
            "财经/商业新闻",
            ["股", "财报", "营收", "利润", "融资", "并购", "市场", "投资", "央行", "通胀", "利率"],
        ),
        (
            "科技/互联网新闻",
            [
                "AI",
                "模型",
                "芯片",
                "开源",
                "算力",
                "大模型",
                "GPU",
                "算法",
                "软件",
                "App",
                "互联网",
            ],
        ),
        (
            "政策/时事新闻",
            ["国务院", "部委", "通报", "发布会", "政策", "法规", "会议", "倡议", "督导"],
        ),
        (
            "教程/操作指南",
            [
                "步骤",
                "教程",
                "如何",
                "怎么",
                "指南",
                "示例",
                "配置",
                "安装",
                "命令",
                "报错",
                "排查",
            ],
        ),
    ]

    for label, ks in keywords:
        if any(k in t for k in ks):
            return label

    return "综合文章"


def _focus_areas_for_article_type(article_type: str) -> list[str]:
    return TYPE_FOCUS_MAP.get(article_type, TYPE_FOCUS_MAP["综合文章"])


def _condense_classification_reason(text: str, article_type: str) -> str:
    cleaned = re.sub(r"\s*【文章类型[:：]\s*.*?】\s*$", "", text, flags=re.S).strip()
    if not cleaned:
        return f"文本的主题、表达方式和信息组织方式更符合“{article_type}”。"

    lines = [line.strip("- ").strip() for line in cleaned.splitlines() if line.strip()]
    summary = " ".join(lines[:2]).strip()
    summary = re.sub(r"\s+", " ", summary)
    if len(summary) > 140:
        summary = summary[:137].rstrip() + "..."
    return summary


def _build_routing_brief(article_type: str, classification_reason: str) -> str:
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


def create_deconstructor_node(base_system_prompt: str):
    """
    Creates a deconstructor node that analyzes the article.
    """

    async def deconstructor(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        article_type = state.get("article_type", "综合文章")
        classification_reason = state.get("classification_reason", "")

        # Use user-configured prompt as the primary instruction source.
        # Supports `{article_type}` placeholder replacement.
        system_prompt = (base_system_prompt or "").strip()
        if not system_prompt:
            system_prompt = "请根据用户输入做拆解分析，条理清晰，分点输出。"

        system_prompt = system_prompt.replace("{article_type}", article_type)
        routing_brief = _build_routing_brief(article_type, classification_reason)
        system_prompt = (
            f"{system_prompt}\n\n"
            f"{routing_brief}\n\n"
            f"{DECONSTRUCTOR_MARKDOWN_GUIDE}\n\n"
            f"{DECONSTRUCTOR_PROFESSIONAL_GUIDE}"
        )

        # The latest AI message belongs to the analyzer node. We convert its value
        # into structured routing context above so the deconstructor can focus on
        # the source text instead of paraphrasing the previous stage.
        llm_messages = (
            messages[:-1] if messages and isinstance(messages[-1], AIMessage) else messages
        )

        @retry(
            wait=wait_exponential(multiplier=1, min=4, max=10),
            stop=stop_after_attempt(5),
            retry=(
                retry_if_exception_type(httpx.HTTPStatusError)
                | retry_if_exception_type(OutputParserException)
            ),
            reraise=True,
        )
        async def _ainvoke_with_retries():
            return await llm.ainvoke([SystemMessage(content=system_prompt)] + llm_messages)

        response = await _ainvoke_with_retries()
        return {"messages": [response]}

    return deconstructor


def create_analyzer_node(base_system_prompt: str):
    """
    Creates an analyzer node that classifies the text into an article type.
    """

    async def analyzer(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        latest = str(getattr(messages[-1], "content", "") or "") if messages else ""

        # Use user-configured prompt as the primary instruction source.
        system_prompt = (base_system_prompt or "").strip()
        if not system_prompt:
            system_prompt = "你是一个专业的文本分类器。请阅读用户输入，判定文章类型，并在结尾严格输出：【文章类型：XXX】。"

        @retry(
            wait=wait_exponential(multiplier=1, min=4, max=10),
            stop=stop_after_attempt(5),
            retry=(
                retry_if_exception_type(httpx.HTTPStatusError)
                | retry_if_exception_type(OutputParserException)
            ),
            reraise=True,
        )
        async def _ainvoke_with_retries():
            return await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)

        result = await _ainvoke_with_retries()
        text = str(getattr(result, "content", "") or "")

        match = re.search(r"【文章类型[:：]\s*(.*?)】", text)
        article_type = match.group(1).strip() if match else _guess_article_type(latest)
        classification_reason = _condense_classification_reason(text, article_type)

        content = text.strip()
        if not content:
            content = f"判定文章类型为：【{article_type}】。\n【文章类型：{article_type}】"

        return {
            "article_type": article_type,
            "classification_reason": classification_reason,
            "messages": [AIMessage(content=content)],
        }

    return analyzer
