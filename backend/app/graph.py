from .graphs.registry import compile_graph, resolve_graph_settings
from .repositories.graph_configs import get_active_graph_config


def get_graph():
    graph_type, system_prompt, analyzer_prompt, deconstructor_prompt = resolve_graph_settings(
        get_active_graph_config()
    )
    return compile_graph(graph_type, system_prompt, analyzer_prompt, deconstructor_prompt)


def invalidate_graph_cache() -> None:
    compile_graph.cache_clear()
