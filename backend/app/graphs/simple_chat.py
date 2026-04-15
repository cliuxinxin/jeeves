from ..schemas import GraphType
from .pipeline import build_pipeline_graph


def build_simple_chat_graph(system_prompt: str):
    return build_pipeline_graph(
        graph_type=GraphType.SIMPLE_CHAT,
        prompt_values={"system_prompt": system_prompt},
    )
