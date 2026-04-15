from ..schemas import GraphType
from .pipeline import build_pipeline_graph


def build_summary_analysis_graph(analyzer_prompt: str, deconstructor_prompt: str):
    return build_pipeline_graph(
        graph_type=GraphType.SUMMARY_ANALYSIS,
        prompt_values={
            "analyzer_prompt": analyzer_prompt,
            "deconstructor_prompt": deconstructor_prompt,
        },
    )
