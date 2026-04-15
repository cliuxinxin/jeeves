from typing import Any

from langchain_core.messages import SystemMessage

from ..ai_logging import ai_log_scope
from ..llm import get_llm
from ..messages import extract_text_content
from ..node_runs import build_node_update
from ..prompt_compiler import compile_assistant_prompt


def create_assistant_node(system_prompt: str):
    """
    Creates an assistant node graph function with an injected system prompt.
    """

    async def assistant(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        compiled_system_prompt = compile_assistant_prompt(system_prompt)
        messages = [SystemMessage(content=compiled_system_prompt)] + state["messages"]

        with ai_log_scope(node_name="assistant", operation="graph_node"):
            response = await llm.ainvoke(messages)
        output = extract_text_content(getattr(response, "content", "")) or "模型返回了空响应。"
        return build_node_update(
            node="assistant",
            output=output,
            state_update={"final_output": output},
            final_output=output,
        )

    return assistant
