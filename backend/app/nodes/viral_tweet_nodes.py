import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ..ai_logging import ai_log_scope
from ..llm import get_llm
from ..messages import extract_text_content
from ..node_runs import build_node_update
from ..prompt_compiler import compile_viral_strategist_prompt, compile_viral_writer_prompt


def _extract_axis(text: str) -> str:
    match = re.search(r"【传播主轴[:：]\s*(.*?)】", text)
    if match:
        return match.group(1).strip()

    lines = [line.strip("- ").strip() for line in text.splitlines() if line.strip()]
    if lines:
        return lines[0][:80]
    return "把 idea 打造成有传播张力的推文。"


def _latest_user_message(messages: list[Any]) -> str:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return str(getattr(message, "content", "") or "")
    return ""


def create_tweet_strategist_node(base_system_prompt: str):
    async def strategist(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        system_prompt = compile_viral_strategist_prompt(base_system_prompt)
        with ai_log_scope(node_name="strategist", operation="graph_node"):
            result = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        text = extract_text_content(getattr(result, "content", ""), strip=False).strip()
        if not text:
            latest_user_input = _latest_user_message(messages)
            text = (
                "已根据当前输入提炼传播策略。\n"
                f"- 用户输入主题：{latest_user_input[:120] or '未提供明确主题'}\n"
                "【传播主轴：把 idea 打造成有传播张力的推文】"
            )

        viral_axis = _extract_axis(text)
        return build_node_update(
            node="strategist",
            output=text,
            state_update={
                "viral_axis": viral_axis,
                "strategy_text": text,
            },
        )

    return strategist


def create_tweet_writer_node(base_system_prompt: str):
    async def writer(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        viral_axis = state.get("viral_axis", "把 idea 打造成有传播张力的推文。")
        strategy_text = str(state.get("strategy_text", "") or "")

        system_prompt = compile_viral_writer_prompt(
            base_system_prompt,
            viral_axis=viral_axis,
            strategy_text=strategy_text,
        )
        with ai_log_scope(node_name="writer", operation="graph_node"):
            response = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        output = extract_text_content(getattr(response, "content", "")) or "模型返回了空响应。"
        return build_node_update(
            node="writer",
            output=output,
            state_update={"final_output": output},
            final_output=output,
        )

    return writer
