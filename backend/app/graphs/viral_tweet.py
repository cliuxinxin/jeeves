from ..schemas import GraphType
from .pipeline import build_pipeline_graph


def build_viral_tweet_graph(strategist_prompt: str, writer_prompt: str):
    return build_pipeline_graph(
        graph_type=GraphType.VIRAL_TWEET,
        prompt_values={
            "analyzer_prompt": strategist_prompt,
            "deconstructor_prompt": writer_prompt,
        },
    )
