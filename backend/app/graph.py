from functools import lru_cache
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from .llm import get_llm


class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


async def assistant(state: GraphState) -> dict[str, list[AnyMessage]]:
    llm = get_llm()
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}


@lru_cache(maxsize=1)
def get_graph():
    builder = StateGraph(GraphState)
    builder.add_node("assistant", assistant)
    builder.add_edge(START, "assistant")
    builder.add_edge("assistant", END)
    return builder.compile()
