from .graph_prompt_values import prompt_values_cache_key
from .graphs.registry import compile_graph, resolve_graph_settings
from .repositories.graph_configs import get_active_graph_config, get_graph_config


def get_graph(graph_config_id: int | None = None):
    config = (
        get_graph_config(graph_config_id)
        if graph_config_id is not None
        else get_active_graph_config()
    )
    graph_type, prompt_values = resolve_graph_settings(config)
    return compile_graph(graph_type, prompt_values_cache_key(prompt_values))


def invalidate_graph_cache() -> None:
    compile_graph.cache_clear()
