from typing import Any

import re

from langchain_core.messages import AIMessage, SystemMessage

from ..llm import get_llm


def create_analyzer_node():
    """
    Creates an analyzer node that dynamically types the article.
    """
    async def analyzer(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]

        system_prompt = (
            "你是一个专业的文本分类器。你的目标是分析下方提供的文章（或是对话历史中最新的长文本），"
            "并精准判定它的分类。\n\n"
            "你可以用一小段文字给出你分析的思考过程，然后【**必须**】在你的回复结尾严格输出格式如下的结论："
            "【文章类型：你的分类结果】（例如：商业新闻、科技普及、长篇散文、研究报告等）。"
        )

        result_msg = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        text_content = str(result_msg.content)
        
        # Parse the article_type from the text
        match = re.search(r"【文章类型：(.*?)】", text_content)
        article_type = match.group(1).strip() if match else "综合文章"

        return {
            "article_type": article_type
        }

    return analyzer


def create_deconstructor_node(base_system_prompt: str):
    """
    Creates a deconstructor node that uses the determined type to analyze the article.
    """
    async def deconstructor(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        article_type = state.get("article_type", "未知类型")

        # Inject the article type and user prompt into the system prompt for the second node
        system_prompt = (
            f"{base_system_prompt}\n\n"
            f"---\n"
            f"前置分析节点已判定用户发来的文本类型为：【{article_type}】。\n"
            f"请你严格按照上述的【文章类型】特点，对用户的输入进行详尽、针对性地拆解分析。\n\n"
            f"【要求】：在生成内容的**开头**，请必须包含以下这句话（加粗并使用对应类别标明）以告知用户：\n"
            f"**[系统分析]** 判定文章类型为：【{article_type}】。"
        )

        response = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        return {"messages": [response]}

    return deconstructor
