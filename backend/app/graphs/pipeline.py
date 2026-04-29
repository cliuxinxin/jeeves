from operator import add
from typing import Annotated, Mapping, NotRequired, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph import END, START, StateGraph

from ..graph_contracts import get_graph_node_contracts
from ..node_registry import build_registered_node
from ..node_runs import NodeRun
from ..schemas import GraphType


class PipelineState(TypedDict):
    messages: list[AnyMessage]
    node_runs: Annotated[list[NodeRun], add]
    article_type: NotRequired[str]
    classification_reason: NotRequired[str]
    viral_axis: NotRequired[str]
    strategy_text: NotRequired[str]
    value_routes: NotRequired[list[str]]
    route_reason: NotRequired[str]
    diagnosis_tags: NotRequired[list[str]]
    diagnosis_summary: NotRequired[str]
    final_output: NotRequired[str]


def build_pipeline_graph(
    *,
    graph_type: GraphType,
    prompt_values: Mapping[str, str],
):
    builder = StateGraph(PipelineState)
    contracts = get_graph_node_contracts(graph_type)
    if not contracts:
        raise ValueError(f"No node contracts registered for graph type: {graph_type}")

    for contract in contracts:
        builder.add_node(
            contract.node,
            build_registered_node(
                contract,
                prompt_values=prompt_values,
            ),
        )

    builder.add_edge(START, contracts[0].node)
    for current_contract, next_contract in zip(contracts, contracts[1:], strict=False):
        builder.add_edge(current_contract.node, next_contract.node)
    builder.add_edge(contracts[-1].node, END)

    return builder.compile()
