from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .prompt_defaults import (
    DEFAULT_ANALYZER_PROMPT,
    DEFAULT_ARTICLE_VALUE_CARDS_PROMPT,
    DEFAULT_ARTICLE_VALUE_ROUTER_PROMPT,
    DEFAULT_ASSISTANT_SYSTEM_PROMPT,
    DEFAULT_PARENT_VERIFICATION_PROMPT,
    DEFAULT_SINGLE_QUESTION_DIAGNOSER_PROMPT,
    DEFAULT_VIRAL_TWEET_STRATEGIST_PROMPT,
    DEFAULT_VIRAL_TWEET_WRITER_PROMPT,
)
from .schemas import GraphType

TARGET_STUDENT_PROFILE_KEY = "target_student_profile"


class PromptTemplateKind(str, Enum):
    ASSISTANT = "assistant"
    SUMMARY_ANALYZER = "summary_analyzer"
    SUMMARY_DECONSTRUCTOR = "summary_deconstructor"
    VIRAL_STRATEGIST = "viral_strategist"
    VIRAL_WRITER = "viral_writer"
    ARTICLE_VALUE_ROUTER = "article_value_router"
    ARTICLE_VALUE_CARDS = "article_value_cards"
    SINGLE_QUESTION_DIAGNOSER = "single_question_diagnoser"
    PARENT_VERIFIER = "parent_verifier"


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
                label="阶段 1 · 价值抓手",
                purpose="筛出这篇文章最值得拿走的价值抓手，决定后续卡片生成重点。",
                reads=("messages",),
                writes=("value_routes", "route_reason"),
                prompt_kind=PromptTemplateKind.ARTICLE_VALUE_ROUTER,
                prompt_config_key=PromptConfigField.ANALYZER.value,
            ),
            NodeContract(
                node="card_writer",
                label="阶段 2 · 收藏卡片",
                purpose="基于价值抓手生成收藏级洞察卡片，而不是摘要式总结。",
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
                label="阶段 1 提示词（价值抓手筛选器）",
                description="用于筛出文章最值得拿走的价值抓手。",
                placeholder="例如：优先判断 framework / contrarian / opportunity，只有主轴明显匹配时再考虑 signal / risk / expression。",
            ),
            PromptFieldDefinition(
                key=PromptConfigField.DECONSTRUCTOR.value,
                label="阶段 2 提示词（收藏级卡片编辑）",
                description="用于按价值抓手生成收藏级洞察卡片。",
                placeholder="例如：不要机械总结全文，输出 2-4 张标题像判断、正文可复用的洞察卡片。",
            ),
        ),
    ),
    GraphType.SINGLE_QUESTION_DIAGNOSIS: GraphContract(
        graph_type=GraphType.SINGLE_QUESTION_DIAGNOSIS,
        label="单题错因排查",
        node_contracts=(
            NodeContract(
                node="mistake_analyzer",
                label="阶段 1 · 单题错因分析",
                purpose="围绕这一次具体错题，输出 2 到 3 个可验证的错因假设。",
                reads=("messages",),
                writes=("diagnosis_tags", "diagnosis_summary"),
                prompt_kind=PromptTemplateKind.SINGLE_QUESTION_DIAGNOSER,
                prompt_config_key=PromptConfigField.ANALYZER.value,
            ),
            NodeContract(
                node="parent_verifier",
                label="阶段 2 · 家长验证提问",
                purpose="根据初步错因分析，生成家长可直接口头提问的排查问题。",
                reads=("messages", "diagnosis_tags", "diagnosis_summary"),
                writes=("final_output",),
                prompt_kind=PromptTemplateKind.PARENT_VERIFIER,
                prompt_config_key=PromptConfigField.DECONSTRUCTOR.value,
            ),
        ),
        state_slot_definitions=(
            StateSlotDefinition(
                name="messages",
                label="messages",
                description="本次具体错题的题目、孩子答案、标准答案，以及家长补充的观察信息。",
                kind=StateSlotKind.INPUT,
            ),
            StateSlotDefinition(
                name="diagnosis_tags",
                label="diagnosis_tags",
                description="阶段 1 提炼出的错因排查标签，帮助阶段 2 生成更有针对性的验证问法。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="diagnosis_summary",
                label="diagnosis_summary",
                description="阶段 1 的简短分析摘要，概括这道题目前最值得优先排查的方向。",
                kind=StateSlotKind.INTERMEDIATE,
            ),
            StateSlotDefinition(
                name="final_output",
                label="final_output",
                description="阶段 2 生成的家长验证提问与观察指引。",
                kind=StateSlotKind.OUTPUT,
            ),
        ),
        prompt_field_definitions=(
            PromptFieldDefinition(
                key=TARGET_STUDENT_PROFILE_KEY,
                label="针对对象",
                description="填写这位孩子的长期背景，系统会在分析具体错题时参考。",
                placeholder=(
                    "例如：\n"
                    "昵称/称呼：小明\n"
                    "年龄 / 年级：8 岁，二年级\n"
                    "学科和当前学习阶段：数学，正在学 20 以内退位减法\n"
                    "平时常见卡点：看懂题慢，口头会说但落到纸面容易乱\n"
                    "表达特点：需要一步一步问"
                ),
            ),
            PromptFieldDefinition(
                key=PromptConfigField.ANALYZER.value,
                label="阶段 1 提示词（单题错因分析）",
                description="用于围绕具体错题生成可验证的错因假设。",
                placeholder="例如：请只围绕这道题本身分析 2 到 3 个最可能的错因，不要泛泛归因为粗心。",
            ),
            PromptFieldDefinition(
                key=PromptConfigField.DECONSTRUCTOR.value,
                label="阶段 2 提示词（家长验证提问）",
                description="用于把初步错因分析转成家长可直接提问的验证问题。",
                placeholder="例如：请生成家长能直接口头提问的短问题，每题说明它在验证什么。",
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
    GraphType.SINGLE_QUESTION_DIAGNOSIS: GraphPromptDefaults(
        default_system_prompt=DEFAULT_ASSISTANT_SYSTEM_PROMPT,
        default_analyzer_prompt=DEFAULT_SINGLE_QUESTION_DIAGNOSER_PROMPT,
        default_deconstructor_prompt=DEFAULT_PARENT_VERIFICATION_PROMPT,
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
