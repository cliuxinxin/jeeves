from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .prompt_defaults import (
    DEFAULT_ANALYZER_PROMPT,
    DEFAULT_ARTICLE_VALUE_CARDS_PROMPT,
    DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT,
    DEFAULT_ASSISTANT_SYSTEM_PROMPT,
    DEFAULT_VIRAL_TWEET_STRATEGIST_PROMPT,
    DEFAULT_VIRAL_TWEET_WRITER_PROMPT,
)
from .schemas import GraphType


class PromptTemplateKind(str, Enum):
    ASSISTANT = "assistant"
    SUMMARY_ANALYZER = "summary_analyzer"
    SUMMARY_DECONSTRUCTOR = "summary_deconstructor"
    VIRAL_STRATEGIST = "viral_strategist"
    VIRAL_WRITER = "viral_writer"
    ARTICLE_VALUE_ROUTER = "article_value_router"
    ARTICLE_VALUE_CARDS = "article_value_cards"


class PromptConfigField(str, Enum):
    SYSTEM = "system_prompt"
    ANALYZER = "analyzer_prompt"
    DECONSTRUCTOR = "deconstructor_prompt"


class StateSlotKind(str, Enum):
    INPUT = "input"
    INTERMEDIATE = "intermediate"
    OUTPUT = "output"


@dataclass(frozen=True)
class NodeContract:
    node: str
    label: str
    purpose: str
    reads: tuple[str, ...]
    writes: tuple[str, ...]
    prompt_kind: PromptTemplateKind
    prompt_config_key: str


@dataclass(frozen=True)
class StateSlotDefinition:
    name: str
    label: str
    description: str
    kind: StateSlotKind


@dataclass(frozen=True)
class StateSlotContract:
    name: str
    label: str
    description: str
    kind: StateSlotKind
    written_by: tuple[str, ...]
    read_by: tuple[str, ...]


@dataclass(frozen=True)
class PromptFieldDefinition:
    key: str
    label: str
    description: str
    placeholder: str


@dataclass(frozen=True)
class GraphContract:
    graph_type: GraphType
    label: str
    node_contracts: tuple[NodeContract, ...]
    state_slot_definitions: tuple[StateSlotDefinition, ...]
    prompt_field_definitions: tuple[PromptFieldDefinition, ...]


@dataclass(frozen=True)
class GraphPromptDefaults:
    default_system_prompt: str
    default_analyzer_prompt: str
    default_deconstructor_prompt: str | None
    deconstructor_falls_back_to_system: bool = False


GRAPH_CONTRACTS: dict[GraphType, GraphContract] = {
    GraphType.SIMPLE_CHAT: GraphContract(
        graph_type=GraphType.SIMPLE_CHAT,
        label="简单对话",
        node_contracts=(
            NodeContract(
                node="assistant",
                label="最终回复",
                purpose="直接根据对话上下文生成最终回复。",
                reads=("messages",),
                writes=("final_output",),
                prompt_kind=PromptTemplateKind.ASSISTANT,
                prompt_config_key=PromptConfigField.SYSTEM.value,
            ),
        ),
        state_slot_definitions=(
            StateSlotDefinition(
                name="messages",
                label="messages",
                description="当前会话上下文，包含用户与助手的历史消息。",
                kind=StateSlotKind.INPUT,
            ),
            StateSlotDefinition(
                name="final_output",
                label="final_output",
                description="最终回复内容，会展示在聊天区并持久化到会话消息。",
                kind=StateSlotKind.OUTPUT,
            ),
        ),
        prompt_field_definitions=(
            PromptFieldDefinition(
                key=PromptConfigField.SYSTEM.value,
                label="系统提示词 (System Prompt)",
                description="此提示词将被注入到最终回复节点中。",
                placeholder="在这里编写 Prompt",
            ),
        ),
    ),
    GraphType.SUMMARY_ANALYSIS: GraphContract(
        graph_type=GraphType.SUMMARY_ANALYSIS,
        label="总结分析",
        node_contracts=(
            NodeContract(
                node="analyzer",
                label="阶段 1 · 初步分析",
                purpose="先判断文章类型，并给后续拆解提供路由依据。",
                reads=("messages",),
                writes=("article_type", "classification_reason"),
                prompt_kind=PromptTemplateKind.SUMMARY_ANALYZER,
                prompt_config_key=PromptConfigField.ANALYZER.value,
            ),
            NodeContract(
                node="deconstructor",
                label="阶段 2 · 拆解分析",
                purpose="结合分类结果生成最终结构化分析内容。",
                reads=("messages", "article_type", "classification_reason"),
                writes=("final_output",),
                prompt_kind=PromptTemplateKind.SUMMARY_DECONSTRUCTOR,
                prompt_config_key=PromptConfigField.DECONSTRUCTOR.value,
            ),
        ),
        state_slot_definitions=(
            StateSlotDefinition(
                name="messages",
                label="messages",
                description="原始文章或用户输入文本，以及当前会话上下文。",
                kind=StateSlotKind.INPUT,
            ),
            StateSlotDefinition(
                name="article_type",
                label="article_type",
                description="阶段 1 提取出的文章类型，用于决定阶段 2 的拆解重点。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="classification_reason",
                label="classification_reason",
                description="阶段 1 对类型判断的简短理由，用于作为阶段 2 的路由说明。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="final_output",
                label="final_output",
                description="阶段 2 生成的最终分析结果。",
                kind=StateSlotKind.OUTPUT,
            ),
        ),
        prompt_field_definitions=(
            PromptFieldDefinition(
                key=PromptConfigField.ANALYZER.value,
                label="阶段 1 提示词（analyzer）",
                description="用于“初步分析/类型判定”节点。",
                placeholder="例如：你是一个专业文本分类器...",
            ),
            PromptFieldDefinition(
                key=PromptConfigField.DECONSTRUCTOR.value,
                label="阶段 2 提示词（deconstructor）",
                description="用于“拆解分析”节点。",
                placeholder="例如：请按要点、结构、风险、建议输出...",
            ),
        ),
    ),
    GraphType.VIRAL_TWEET: GraphContract(
        graph_type=GraphType.VIRAL_TWEET,
        label="爆款推文",
        node_contracts=(
            NodeContract(
                node="strategist",
                label="阶段 1 · 传播策略",
                purpose="提炼传播主轴、受众和写作策略。",
                reads=("messages",),
                writes=("viral_axis", "strategy_text"),
                prompt_kind=PromptTemplateKind.VIRAL_STRATEGIST,
                prompt_config_key=PromptConfigField.ANALYZER.value,
            ),
            NodeContract(
                node="writer",
                label="阶段 2 · 推文成稿",
                purpose="基于策略上下文生成最终推文成稿。",
                reads=("messages", "viral_axis", "strategy_text"),
                writes=("final_output",),
                prompt_kind=PromptTemplateKind.VIRAL_WRITER,
                prompt_config_key=PromptConfigField.DECONSTRUCTOR.value,
            ),
        ),
        state_slot_definitions=(
            StateSlotDefinition(
                name="messages",
                label="messages",
                description="用户提供的 idea、资料和对话上下文。",
                kind=StateSlotKind.INPUT,
            ),
            StateSlotDefinition(
                name="viral_axis",
                label="viral_axis",
                description="阶段 1 提炼出的传播主轴，决定阶段 2 的核心角度。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="strategy_text",
                label="strategy_text",
                description="阶段 1 的完整策略文本，供阶段 2 生成推文时参考。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="final_output",
                label="final_output",
                description="阶段 2 生成的最终推文成稿。",
                kind=StateSlotKind.OUTPUT,
            ),
        ),
        prompt_field_definitions=(
            PromptFieldDefinition(
                key=PromptConfigField.ANALYZER.value,
                label="阶段 1 提示词（strategist）",
                description="用于“传播策略 / 爆点角度提炼”节点。",
                placeholder="例如：先提炼受众、钩子、冲突点和传播主轴...",
            ),
            PromptFieldDefinition(
                key=PromptConfigField.DECONSTRUCTOR.value,
                label="阶段 2 提示词（writer）",
                description="用于“推文成稿”节点。",
                placeholder="例如：生成主推文、1 条备选版本、首评与互动问题...",
            ),
        ),
    ),
    GraphType.ARTICLE_VALUE: GraphContract(
        graph_type=GraphType.ARTICLE_VALUE,
        label="文章价值卡片",
        node_contracts=(
            NodeContract(
                node="value_router",
                label="阶段 1 · 价值路由",
                purpose="判断这篇文章最值得拿走的价值角度，决定后续卡片生成重点。",
                reads=("messages",),
                writes=("value_routes", "route_reason"),
                prompt_kind=PromptTemplateKind.ARTICLE_VALUE_ROUTER,
                prompt_config_key=PromptConfigField.ANALYZER.value,
            ),
            NodeContract(
                node="card_writer",
                label="阶段 2 · 洞察卡片",
                purpose="基于价值路由生成动态洞察卡片，而不是固定格式总结。",
                reads=("messages", "value_routes", "route_reason"),
                writes=("final_output",),
                prompt_kind=PromptTemplateKind.ARTICLE_VALUE_CARDS,
                prompt_config_key=PromptConfigField.DECONSTRUCTOR.value,
            ),
        ),
        state_slot_definitions=(
            StateSlotDefinition(
                name="messages",
                label="messages",
                description="原始文章内容和当前会话上下文。",
                kind=StateSlotKind.INPUT,
            ),
            StateSlotDefinition(
                name="value_routes",
                label="value_routes",
                description="阶段 1 选出的价值角度，比如 signal、framework、opportunity。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="route_reason",
                label="route_reason",
                description="阶段 1 对路由选择的简短理由，帮助阶段 2 聚焦真正有价值的点。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="final_output",
                label="final_output",
                description="阶段 2 生成的动态洞察卡片输出。",
                kind=StateSlotKind.OUTPUT,
            ),
        ),
        prompt_field_definitions=(
            PromptFieldDefinition(
                key=PromptConfigField.ANALYZER.value,
                label="阶段 1 提示词（value router）",
                description="用于判断文章最值得拿走的价值路由。",
                placeholder="例如：请从 signal/framework/opportunity 等角度中挑选最值得关注的 2-3 个。",
            ),
            PromptFieldDefinition(
                key=PromptConfigField.DECONSTRUCTOR.value,
                label="阶段 2 提示词（card writer）",
                description="用于按价值路由生成动态洞察卡片。",
                placeholder="例如：不要机械总结全文，输出 2-4 张真正值得拿走的洞察卡片。",
            ),
        ),
    ),
}

AUXILIARY_NODE_LABELS: dict[str, str] = {
    "title_generator": "标题生成",
    "llm_test": "模型测试",
}

GRAPH_PROMPT_DEFAULTS: dict[GraphType, GraphPromptDefaults] = {
    GraphType.SIMPLE_CHAT: GraphPromptDefaults(
        default_system_prompt=DEFAULT_ASSISTANT_SYSTEM_PROMPT,
        default_analyzer_prompt="",
        default_deconstructor_prompt="",
    ),
    GraphType.SUMMARY_ANALYSIS: GraphPromptDefaults(
        default_system_prompt=DEFAULT_ASSISTANT_SYSTEM_PROMPT,
        default_analyzer_prompt=DEFAULT_ANALYZER_PROMPT,
        default_deconstructor_prompt=None,
        deconstructor_falls_back_to_system=True,
    ),
    GraphType.VIRAL_TWEET: GraphPromptDefaults(
        default_system_prompt=DEFAULT_ASSISTANT_SYSTEM_PROMPT,
        default_analyzer_prompt=DEFAULT_VIRAL_TWEET_STRATEGIST_PROMPT,
        default_deconstructor_prompt=DEFAULT_VIRAL_TWEET_WRITER_PROMPT,
    ),
    GraphType.ARTICLE_VALUE: GraphPromptDefaults(
        default_system_prompt=DEFAULT_ASSISTANT_SYSTEM_PROMPT,
        default_analyzer_prompt=DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT,
        default_deconstructor_prompt=DEFAULT_ARTICLE_VALUE_CARDS_PROMPT,
    ),
}


def get_graph_contract(graph_type: GraphType) -> GraphContract:
    return GRAPH_CONTRACTS[graph_type]


def get_graph_node_contracts(graph_type: GraphType) -> tuple[NodeContract, ...]:
    return get_graph_contract(graph_type).node_contracts


def get_graph_state_slot_contracts(graph_type: GraphType) -> tuple[StateSlotContract, ...]:
    graph_contract = get_graph_contract(graph_type)
    node_contracts = graph_contract.node_contracts
    return tuple(
        StateSlotContract(
            name=slot.name,
            label=slot.label,
            description=slot.description,
            kind=slot.kind,
            written_by=tuple(
                contract.node for contract in node_contracts if slot.name in contract.writes
            ),
            read_by=tuple(
                contract.node for contract in node_contracts if slot.name in contract.reads
            ),
        )
        for slot in graph_contract.state_slot_definitions
    )


def get_graph_prompt_field_definitions(
    graph_type: GraphType,
) -> tuple[PromptFieldDefinition, ...]:
    return get_graph_contract(graph_type).prompt_field_definitions


def get_graph_prompt_defaults(graph_type: GraphType) -> GraphPromptDefaults:
    return GRAPH_PROMPT_DEFAULTS[graph_type]


def find_node_contract(node: str) -> NodeContract | None:
    for graph_contract in GRAPH_CONTRACTS.values():
        for contract in graph_contract.node_contracts:
            if contract.node == node:
                return contract
    return None


def get_node_label(node: str) -> str:
    contract = find_node_contract(node)
    if contract is not None:
        return contract.label
    if node in AUXILIARY_NODE_LABELS:
        return AUXILIARY_NODE_LABELS[node]
    return f"节点 · {node}"
