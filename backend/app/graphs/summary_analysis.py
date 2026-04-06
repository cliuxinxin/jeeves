from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from ..nodes.summary_analysis_nodes import create_analyzer_node, create_deconstructor_node


class SummaryAnalysisState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    article_type: str


def build_summary_analysis_graph(system_prompt: str):
    builder = StateGraph(SummaryAnalysisState)
    
    analyzer_node = create_analyzer_node()
    deconstructor_node = create_deconstructor_node(system_prompt)
    
    builder.add_node("analyzer", analyzer_node)
    builder.add_node("deconstructor", deconstructor_node)
    
    builder.add_edge(START, "analyzer")
    builder.add_edge("analyzer", "deconstructor")
    builder.add_edge("deconstructor", END)
    
    return builder.compile()
