from .graph_config_store import get_active_graph_config
from .graphs.simple_chat import build_simple_chat_graph
from .graphs.summary_analysis import build_summary_analysis_graph

def get_graph():
    active_config = get_active_graph_config()
    if not active_config:
        return build_simple_chat_graph(system_prompt="")
        
    system_prompt = active_config.system_prompt
    graph_type = active_config.graph_type
    
    if graph_type == "summary_analysis":
        return build_summary_analysis_graph(system_prompt=system_prompt)
        
    return build_simple_chat_graph(system_prompt=system_prompt)
