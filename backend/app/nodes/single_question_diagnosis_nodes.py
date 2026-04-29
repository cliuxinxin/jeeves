import re
from typing import Any, Mapping

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ..ai_logging import ai_log_scope
from ..graph_contracts import TARGET_STUDENT_PROFILE_KEY
from ..llm import get_llm
from ..messages import extract_text_content
from ..node_runs import build_node_update
from ..prompt_compiler import (
    compile_parent_verifier_prompt,
    compile_single_question_diagnoser_prompt,
)

DIAGNOSIS_TAG_ALIASES = {
    "题意理解": "题意理解偏差",
    "题意理解偏差": "题意理解偏差",
    "审题": "题意理解偏差",
    "概念": "概念理解断点",
    "概念理解": "概念理解断点",
    "概念理解断点": "概念理解断点",
    "步骤": "步骤执行断点",
    "步骤执行": "步骤执行断点",
    "步骤执行断点": "步骤执行断点",
    "计算": "计算处理失误",
    "计算失误": "计算处理失误",
    "计算处理失误": "计算处理失误",
    "表达": "表达映射困难",
    "表达映射": "表达映射困难",
    "表达映射困难": "表达映射困难",
}

FALLBACK_DIAGNOSIS_TAGS = [
    "题意理解偏差",
    "概念理解断点",
    "步骤执行断点",
    "计算处理失误",
    "表达映射困难",
]


def _latest_user_text(messages: list[Any]) -> str:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return str(getattr(message, "content", "") or "")
    if not messages:
        return ""
    return extract_text_content(getattr(messages[-1], "content", ""), strip=False)


def _normalize_diagnosis_tag(tag: str) -> str | None:
    token = tag.strip()
    if not token:
        return None
    lowered = token.lower()
    return DIAGNOSIS_TAG_ALIASES.get(token) or DIAGNOSIS_TAG_ALIASES.get(lowered) or token


def _extract_diagnosis_tags(text: str) -> list[str]:
    match = re.search(r"【排查标签[:：]\s*(.*?)】", text, flags=re.S)
    if not match:
        return []

    tags: list[str] = []
    for raw_tag in re.split(r"[，,、/|\n]+", match.group(1)):
        normalized = _normalize_diagnosis_tag(raw_tag)
        if normalized and normalized not in tags:
            tags.append(normalized)
        if len(tags) >= 3:
            break
    return tags


def _fallback_diagnosis_tags(text: str) -> list[str]:
    content = (text or "").strip()
    detected: list[str] = []

    def add(tag: str) -> None:
        if tag not in detected:
            detected.append(tag)

    if any(keyword in content for keyword in ("为什么", "题意", "要求", "问什么", "看不懂")):
        add("题意理解偏差")
    if any(keyword in content for keyword in ("借位", "进位", "单位", "概念", "为什么这样")):
        add("概念理解断点")
    if any(keyword in content for keyword in ("步骤", "做到一半", "下一步", "顺序")):
        add("步骤执行断点")
    if any(keyword in content for keyword in ("算错", "抄错", "符号", "漏写", "看成")):
        add("计算处理失误")
    if any(keyword in content for keyword in ("会说不会写", "表达不清", "列式", "落到纸上")):
        add("表达映射困难")

    for tag in FALLBACK_DIAGNOSIS_TAGS:
        if len(detected) >= 2:
            break
        add(tag)

    return detected[:3]


def _condense_diagnosis_summary(text: str, tags: list[str]) -> str:
    cleaned = re.sub(r"\s*【排查标签[:：]\s*.*?】\s*$", "", text, flags=re.S).strip()
    if not cleaned:
        return f"这道题目前更值得优先排查：{'、'.join(tags)}。"

    lines = [line.strip("- ").strip() for line in cleaned.splitlines() if line.strip()]
    summary = " ".join(lines[:3]).strip()
    summary = re.sub(r"\s+", " ", summary)
    if len(summary) > 180:
        summary = summary[:177].rstrip() + "..."
    return summary


def create_mistake_analyzer_node(
    base_system_prompt: str,
    prompt_values: Mapping[str, str],
):
    async def mistake_analyzer(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        target_student_profile = str(
            prompt_values.get(TARGET_STUDENT_PROFILE_KEY, "") or ""
        )
        system_prompt = compile_single_question_diagnoser_prompt(
            base_system_prompt,
            target_student_profile=target_student_profile,
        )

        with ai_log_scope(node_name="mistake_analyzer", operation="graph_node"):
            result = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        text = extract_text_content(getattr(result, "content", ""), strip=False)

        diagnosis_tags = _extract_diagnosis_tags(text)
        if not diagnosis_tags:
            diagnosis_tags = _fallback_diagnosis_tags(_latest_user_text(messages))

        diagnosis_summary = _condense_diagnosis_summary(text, diagnosis_tags)
        content = text.strip()
        if not content:
            content = (
                "## 这道题可能卡在哪里\n\n"
                "### 可能卡点 1\n"
                f"- 可能卡点：{diagnosis_tags[0] if diagnosis_tags else '题意理解偏差'}\n"
                "- 依据：当前输入信息不足，先给出最需要优先排查的方向。\n"
                "- 还需要确认什么：请家长继续追问孩子当时是怎么想的。\n\n"
                f"【排查标签：{','.join(diagnosis_tags)}】"
            )

        return build_node_update(
            node="mistake_analyzer",
            output=content,
            state_update={
                "diagnosis_tags": diagnosis_tags,
                "diagnosis_summary": diagnosis_summary,
            },
        )

    return mistake_analyzer


def create_parent_verifier_node(
    base_system_prompt: str,
    prompt_values: Mapping[str, str],
):
    async def parent_verifier(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        diagnosis_tags = list(state.get("diagnosis_tags") or ["题意理解偏差", "概念理解断点"])
        diagnosis_summary = str(state.get("diagnosis_summary", "") or "")
        target_student_profile = str(
            prompt_values.get(TARGET_STUDENT_PROFILE_KEY, "") or ""
        )

        system_prompt = compile_parent_verifier_prompt(
            base_system_prompt,
            target_student_profile=target_student_profile,
            diagnosis_tags=diagnosis_tags,
            diagnosis_summary=diagnosis_summary,
        )

        llm_messages = (
            messages[:-1] if messages and isinstance(messages[-1], AIMessage) else messages
        )

        with ai_log_scope(node_name="parent_verifier", operation="graph_node"):
            response = await llm.ainvoke([SystemMessage(content=system_prompt)] + llm_messages)
        output = extract_text_content(getattr(response, "content", "")) or "模型返回了空响应。"
        return build_node_update(
            node="parent_verifier",
            output=output,
            state_update={
                "diagnosis_tags": diagnosis_tags,
                "diagnosis_summary": diagnosis_summary,
                "final_output": output,
            },
            final_output=output,
        )

    return parent_verifier
