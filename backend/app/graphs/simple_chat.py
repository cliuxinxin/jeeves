from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from ..nodes.assistant import create_assistant_node


class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


def build_simple_chat_graph(system_prompt: str):
    builder = StateGraph(GraphState)
    assistant_node = create_assistant_node(system_prompt)
    
    builder.add_node("assistant", assistant_node)
    builder.add_edge(START, "assistant")
    builder.add_edge("assistant", END)
    
    return builder.compile()
