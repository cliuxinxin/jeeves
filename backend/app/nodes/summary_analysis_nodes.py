import re
from typing import Any

from langchain_core.messages import AIMessage, SystemMessage

from ..ai_logging import ai_log_scope
from ..llm import get_llm
from ..messages import extract_text_content
from ..node_runs import build_node_update
from ..prompt_compiler import (
    compile_summary_analyzer_prompt,
    compile_summary_deconstructor_prompt,
)


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


def create_deconstructor_node(base_system_prompt: str):
    """
    Creates a deconstructor node that analyzes the article.
    """

    async def deconstructor(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        article_type = state.get("article_type", "综合文章")
        classification_reason = state.get("classification_reason", "")
        system_prompt = compile_summary_deconstructor_prompt(
            base_system_prompt,
            article_type=article_type,
            classification_reason=classification_reason,
        )

        # The latest AI message belongs to the analyzer node. We convert its value
        # into structured routing context above so the deconstructor can focus on
        # the source text instead of paraphrasing the previous stage.
        llm_messages = (
            messages[:-1] if messages and isinstance(messages[-1], AIMessage) else messages
        )

        with ai_log_scope(node_name="deconstructor", operation="graph_node"):
            response = await llm.ainvoke([SystemMessage(content=system_prompt)] + llm_messages)
        output = extract_text_content(getattr(response, "content", "")) or "模型返回了空响应。"
        return build_node_update(
            node="deconstructor",
            output=output,
            state_update={"final_output": output},
            final_output=output,
        )

    return deconstructor


def create_analyzer_node(base_system_prompt: str):
    """
    Creates an analyzer node that classifies the text into an article type.
    """

    async def analyzer(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        latest = str(getattr(messages[-1], "content", "") or "") if messages else ""
        system_prompt = compile_summary_analyzer_prompt(base_system_prompt)

        with ai_log_scope(node_name="analyzer", operation="graph_node"):
            result = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        text = extract_text_content(getattr(result, "content", ""), strip=False)

        match = re.search(r"【文章类型[:：]\s*(.*?)】", text)
        article_type = match.group(1).strip() if match else _guess_article_type(latest)
        classification_reason = _condense_classification_reason(text, article_type)

        content = text.strip()
        if not content:
            content = f"判定文章类型为：【{article_type}】。\n【文章类型：{article_type}】"

        return build_node_update(
            node="analyzer",
            output=content,
            state_update={
                "article_type": article_type,
                "classification_reason": classification_reason,
            },
        )

    return analyzer
