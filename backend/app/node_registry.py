from __future__ import annotations

from typing import Callable, Mapping

from .graph_contracts import NodeContract
from .graph_prompt_values import get_prompt_value
from .nodes.article_value_nodes import create_card_writer_node, create_value_router_node
from .nodes.assistant import create_assistant_node
from .nodes.single_question_diagnosis_nodes import (
    create_mistake_analyzer_node,
    create_parent_verifier_node,
)
from .nodes.summary_analysis_nodes import create_analyzer_node, create_deconstructor_node
from .nodes.viral_tweet_nodes import create_tweet_strategist_node, create_tweet_writer_node

NodeFactory = Callable[..., object]


NODE_FACTORIES: dict[str, NodeFactory] = {
    "assistant": create_assistant_node,
    "analyzer": create_analyzer_node,
    "deconstructor": create_deconstructor_node,
    "strategist": create_tweet_strategist_node,
    "writer": create_tweet_writer_node,
    "value_router": create_value_router_node,
    "card_writer": create_card_writer_node,
    "mistake_analyzer": create_mistake_analyzer_node,
    "parent_verifier": create_parent_verifier_node,
}


def _resolve_prompt_value(
    contract: NodeContract,
    *,
    prompt_values: Mapping[str, str],
) -> str:
    return get_prompt_value(prompt_values, contract.prompt_config_key)


def build_registered_node(
    contract: NodeContract,
    *,
    prompt_values: Mapping[str, str],
):
    factory = NODE_FACTORIES.get(contract.node)
    if factory is None:
        raise ValueError(f"No node factory registered for node: {contract.node}")
    prompt_value = _resolve_prompt_value(
        contract,
        prompt_values=prompt_values,
    )
    if contract.node in {"mistake_analyzer", "parent_verifier"}:
        return factory(prompt_value, dict(prompt_values))
    return factory(prompt_value)
