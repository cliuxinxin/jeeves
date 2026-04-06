from typing import Any

from langchain_core.messages import AnyMessage, SystemMessage

from ..llm import get_llm


def create_assistant_node(system_prompt: str):
    """
    Creates an assistant node graph function with an injected system prompt.
    """

    async def assistant(state: dict[str, Any]) -> dict[str, list[AnyMessage]]:
        llm = get_llm()
        messages = state["messages"]

        if system_prompt:
            messages = [SystemMessage(content=system_prompt)] + messages

        response = await llm.ainvoke(messages)
        return {"messages": [response]}

    return assistant
