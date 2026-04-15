import re
from typing import Any

from langchain_core.messages import SystemMessage

from ..ai_logging import ai_log_scope
from ..llm import get_llm
from ..messages import extract_text_content
from ..node_runs import build_node_update
from ..prompt_compiler import (
    compile_article_value_cards_prompt,
    compile_article_value_router_prompt,
)
from ..prompt_defaults import VALUE_ROUTE_LABELS

ROUTE_ALIASES = {
    "signal": "signal",
    "framework": "framework",
    "contrarian": "contrarian",
    "opportunity": "opportunity",
    "risk": "risk",
    "expression": "expression",
    "市场信号": "signal",
    "新信号": "signal",
    "趋势信号": "signal",
    "框架": "framework",
    "方法": "framework",
    "可复用框架": "framework",
    "反常识": "contrarian",
    "反常识观点": "contrarian",
    "机会": "opportunity",
    "机会切口": "opportunity",
    "商业机会": "opportunity",
    "风险": "risk",
    "风险提醒": "risk",
    "表达": "expression",
    "表达方式": "expression",
    "写法": "expression",
}

FALLBACK_ROUTE_ORDER = [
    "signal",
    "framework",
    "opportunity",
    "risk",
    "contrarian",
    "expression",
]


def _latest_user_text(messages: list[Any]) -> str:
    if not messages:
        return ""
    return extract_text_content(getattr(messages[-1], "content", ""), strip=False)


def _normalize_route(route: str) -> str | None:
    token = route.strip().lower()
    if not token:
        return None
    return ROUTE_ALIASES.get(token)


def _extract_value_routes(text: str) -> list[str]:
    match = re.search(r"【价值路由[:：]\s*(.*?)】", text, flags=re.S)
    if not match:
        return []

    routes: list[str] = []
    for raw_token in re.split(r"[，,、/|\n]+", match.group(1)):
        normalized = _normalize_route(raw_token)
        if normalized and normalized not in routes:
            routes.append(normalized)
        if len(routes) >= 3:
            break
    return routes


def _fallback_value_routes(text: str) -> list[str]:
    content = (text or "").strip()
    detected: list[str] = []

    def add(route: str) -> None:
        if route not in detected:
            detected.append(route)

    if any(keyword in content for keyword in ("教程", "步骤", "方法", "经验", "框架", "怎么做")):
        add("framework")
    if any(keyword in content for keyword in ("风险", "隐患", "警惕", "陷阱", "误判", "不确定")):
        add("risk")
    if any(keyword in content for keyword in ("但是", "却", "反而", "并非", "误解", "常识")):
        add("contrarian")
    if any(keyword in content for keyword in ("机会", "创业", "产品", "商业", "变现", "增长")):
        add("opportunity")
    if any(keyword in content for keyword in ("趋势", "信号", "变化", "数据", "市场", "发布", "增速")):
        add("signal")
    if any(keyword in content for keyword in ("标题", "开头", "表达", "写法", "叙事", "文风")):
        add("expression")

    for route in FALLBACK_ROUTE_ORDER:
        if len(detected) >= 2:
            break
        add(route)

    return detected[:3]


def _condense_route_reason(text: str, routes: list[str]) -> str:
    cleaned = re.sub(r"\s*【价值路由[:：]\s*.*?】\s*$", "", text, flags=re.S).strip()
    if not cleaned:
        labels = "、".join(VALUE_ROUTE_LABELS.get(route, route) for route in routes)
        return f"这篇文章最值得优先从“{labels}”这几个角度拿走信息。"

    lines = [line.strip("- ").strip() for line in cleaned.splitlines() if line.strip()]
    summary = " ".join(lines[:2]).strip()
    summary = re.sub(r"\s+", " ", summary)
    if len(summary) > 160:
        summary = summary[:157].rstrip() + "..."
    return summary


def create_value_router_node(base_system_prompt: str):
    async def value_router(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        system_prompt = compile_article_value_router_prompt(base_system_prompt)

        with ai_log_scope(node_name="value_router", operation="graph_node"):
            result = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        text = extract_text_content(getattr(result, "content", ""), strip=False)

        routes = _extract_value_routes(text)
        if not routes:
            routes = _fallback_value_routes(_latest_user_text(messages))

        route_reason = _condense_route_reason(text, routes)
        content = text.strip()
        if not content:
            content = (
                f"优先价值角度：{','.join(routes)}\n"
                f"理由：{route_reason}\n"
                f"【价值路由：{','.join(routes)}】"
            )

        return build_node_update(
            node="value_router",
            output=content,
            state_update={
                "value_routes": routes,
                "route_reason": route_reason,
            },
        )

    return value_router


def create_card_writer_node(base_system_prompt: str):
    async def card_writer(state: dict[str, Any]) -> dict[str, Any]:
        llm = get_llm()
        messages = state["messages"]
        value_routes = state.get("value_routes") or ["signal", "framework"]
        route_reason = str(state.get("route_reason", "") or "")

        system_prompt = compile_article_value_cards_prompt(
            base_system_prompt,
            value_routes=list(value_routes),
            route_reason=route_reason,
        )

        with ai_log_scope(node_name="card_writer", operation="graph_node"):
            response = await llm.ainvoke([SystemMessage(content=system_prompt)] + messages)
        output = extract_text_content(getattr(response, "content", "")) or "模型返回了空响应。"
        return build_node_update(
            node="card_writer",
            output=output,
            state_update={"final_output": output},
            final_output=output,
        )

    return card_writer
