from __future__ import annotations

import json
from typing import Any, Mapping, TypedDict

from .graph_contracts import get_node_label


class NodeRun(TypedDict):
    node: str
    node_label: str
    output: str
    state_patch: dict[str, str]


def _stringify_state_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return "null"
    if isinstance(value, (int, float, bool)):
        return str(value)
    return json.dumps(value, ensure_ascii=False)


def to_display_state_patch(state_update: Mapping[str, Any] | None) -> dict[str, str]:
    if not state_update:
        return {}

    return {
        key: serialized
        for key, value in state_update.items()
        if (serialized := _stringify_state_value(value))
    }


def build_node_update(
    *,
    node: str,
    node_label: str | None = None,
    output: str,
    state_update: Mapping[str, Any] | None = None,
    final_output: str | None = None,
) -> dict[str, Any]:
    update: dict[str, Any] = {}
    if state_update:
        update.update(state_update)

    update["node_runs"] = [
        NodeRun(
            node=node,
            node_label=node_label or get_node_label(node),
            output=output,
            state_patch=to_display_state_patch(state_update),
        )
    ]
    if final_output is not None:
        update["final_output"] = final_output
    return update


def resolve_final_output(state: Mapping[str, Any]) -> str:
    final_output = state.get("final_output")
    if isinstance(final_output, str) and final_output.strip():
        return final_output.strip()

    node_runs = state.get("node_runs")
    if isinstance(node_runs, list):
        for node_run in reversed(node_runs):
            if isinstance(node_run, Mapping):
                output = node_run.get("output")
                if isinstance(output, str) and output.strip():
                    return output.strip()

    return "模型返回了空响应。"
