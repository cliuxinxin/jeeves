"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, RefreshCw, Save, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewGraphConfig } from "@/lib/api/client";
import type {
  GraphConfigCreateRequest,
  GraphConfigRecord,
  GraphPromptFieldPreview,
  GraphPromptPreviewResponse,
  GraphConfigUpdateRequest,
  GraphNodePromptPreview,
  GraphStateSlotPreview,
  GraphType,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";

type GraphFormState = {
  id: number | null;
  name: string;
  graphType: GraphType;
  promptValues: Record<string, string>;
};

type Notice = {
  type: "success" | "error";
  text: string;
};

type GraphConfigPanelProps = {
  configs: GraphConfigRecord[];
  activeConfigId: number | null;
  isLoading: boolean;
  isSaving: boolean;
  activatingId: number | null;
  onCreateConfig: (payload: GraphConfigCreateRequest) => Promise<GraphConfigRecord>;
  onUpdateConfig: (args: { configId: number; payload: GraphConfigUpdateRequest }) => Promise<GraphConfigRecord>;
  onActivateConfig: (configId: number) => Promise<GraphConfigRecord>;
  onDeleteConfig: (configId: number) => Promise<void>;
};

const emptyForm: GraphFormState = {
  id: null,
  name: "",
  graphType: "simple_chat",
  promptValues: {
    system_prompt: "You are a helpful assistant.",
  },
};

function toGraphFormState(config: GraphConfigRecord): GraphFormState {
  const promptValues = config.prompt_values ?? {
    system_prompt: config.system_prompt,
    analyzer_prompt: config.analyzer_prompt,
    deconstructor_prompt: config.deconstructor_prompt,
  };
  return {
    id: config.id,
    name: config.name,
    graphType: config.graph_type,
    promptValues,
  };
}

function buildLegacyPromptPayload(promptValues: Record<string, string>) {
  return {
    system_prompt: promptValues.system_prompt ?? "",
    analyzer_prompt: promptValues.analyzer_prompt ?? "",
    deconstructor_prompt: promptValues.deconstructor_prompt ?? "",
  };
}

function promptSourceLabel(promptSource?: string) {
  if (promptSource === "system_prompt") return "system_prompt";
  if (promptSource === "analyzer_prompt") return "analyzer_prompt";
  if (promptSource === "deconstructor_prompt") return "deconstructor_prompt";
  return "prompt";
}

function getFallbackPromptFields(graphType: GraphType): GraphPromptFieldPreview[] {
  if (graphType === "summary_analysis") {
    return [
      {
        key: "analyzer_prompt",
        label: "阶段 1 提示词（analyzer）",
        description: "用于“初步分析/类型判定”节点。",
        placeholder: "例如：你是一个专业文本分类器...",
      },
      {
        key: "deconstructor_prompt",
        label: "阶段 2 提示词（deconstructor）",
        description: "用于“拆解分析”节点。",
        placeholder: "例如：请按要点、结构、风险、建议输出...",
      },
    ];
  }

  if (graphType === "viral_tweet") {
    return [
      {
        key: "analyzer_prompt",
        label: "阶段 1 提示词（strategist）",
        description: "用于“传播策略 / 爆点角度提炼”节点。",
        placeholder: "例如：先提炼受众、钩子、冲突点和传播主轴...",
      },
      {
        key: "deconstructor_prompt",
        label: "阶段 2 提示词（writer）",
        description: "用于“推文成稿”节点。",
        placeholder: "例如：生成主推文、1 条备选版本、首评与互动问题...",
      },
    ];
  }

  if (graphType === "article_value") {
    return [
      {
        key: "analyzer_prompt",
        label: "阶段 1 提示词（价值抓手筛选器）",
        description: "用于筛出文章最值得拿走的价值抓手。",
        placeholder:
          "例如：优先判断 framework / contrarian / opportunity，只有主轴明显匹配时再考虑 signal / risk / expression。",
      },
      {
        key: "deconstructor_prompt",
        label: "阶段 2 提示词（收藏级卡片编辑）",
        description: "用于按价值抓手生成收藏级洞察卡片。",
        placeholder: "例如：不要机械总结全文，输出 2-4 张标题像判断、正文可复用的洞察卡片。",
      },
    ];
  }

  return [
    {
      key: "system_prompt",
      label: "系统提示词 (System Prompt)",
      description: "此提示词将被注入到最终回复节点中。",
      placeholder: "在这里编写 Prompt",
    },
  ];
}

function getFallbackNodePreviews(graphType: GraphType): GraphNodePromptPreview[] {
  if (graphType === "summary_analysis") {
    return [
      {
        node: "analyzer",
        node_label: "阶段 1 · 初步分析",
        reads: ["messages"],
        writes: ["article_type", "classification_reason"],
        purpose: "先判断文章类型，并给后续拆解提供路由依据。",
        prompt_source: "analyzer_prompt",
        prompt_preview: "",
      },
      {
        node: "deconstructor",
        node_label: "阶段 2 · 拆解分析",
        reads: ["messages", "article_type", "classification_reason"],
        writes: ["final_output"],
        purpose: "结合分类结果生成最终结构化分析内容。",
        prompt_source: "deconstructor_prompt",
        prompt_preview: "",
      },
    ];
  }

  if (graphType === "viral_tweet") {
    return [
      {
        node: "strategist",
        node_label: "阶段 1 · 传播策略",
        reads: ["messages"],
        writes: ["viral_axis", "strategy_text"],
        purpose: "提炼传播主轴、受众和写作策略。",
        prompt_source: "analyzer_prompt",
        prompt_preview: "",
      },
      {
        node: "writer",
        node_label: "阶段 2 · 推文成稿",
        reads: ["messages", "viral_axis", "strategy_text"],
        writes: ["final_output"],
        purpose: "基于策略上下文生成最终推文成稿。",
        prompt_source: "deconstructor_prompt",
        prompt_preview: "",
      },
    ];
  }

  if (graphType === "article_value") {
    return [
      {
        node: "value_router",
        node_label: "阶段 1 · 价值抓手",
        reads: ["messages"],
        writes: ["value_routes", "route_reason"],
        purpose: "筛出这篇文章最值得拿走的价值抓手，决定后续卡片生成重点。",
        prompt_source: "analyzer_prompt",
        prompt_preview: "",
      },
      {
        node: "card_writer",
        node_label: "阶段 2 · 收藏卡片",
        reads: ["messages", "value_routes", "route_reason"],
        writes: ["final_output"],
        purpose: "基于价值抓手生成收藏级洞察卡片，而不是摘要式总结。",
        prompt_source: "deconstructor_prompt",
        prompt_preview: "",
      },
    ];
  }

  return [
    {
      node: "assistant",
      node_label: "最终回复",
      reads: ["messages"],
      writes: ["final_output"],
      purpose: "直接根据对话上下文生成最终回复。",
      prompt_source: "system_prompt",
      prompt_preview: "",
    },
  ];
}

function getFallbackStateSlots(graphType: GraphType): GraphStateSlotPreview[] {
  if (graphType === "summary_analysis") {
    return [
      {
        name: "messages",
        label: "messages",
        description: "原始文章或用户输入文本，以及当前会话上下文。",
        kind: "input",
        written_by: [],
        read_by: ["analyzer", "deconstructor"],
      },
      {
        name: "article_type",
        label: "article_type",
        description: "阶段 1 提取出的文章类型，用于决定阶段 2 的拆解重点。",
        kind: "intermediate",
        written_by: ["analyzer"],
        read_by: ["deconstructor"],
      },
      {
        name: "classification_reason",
        label: "classification_reason",
        description: "阶段 1 对类型判断的简短理由，用于作为阶段 2 的路由说明。",
        kind: "intermediate",
        written_by: ["analyzer"],
        read_by: ["deconstructor"],
      },
      {
        name: "final_output",
        label: "final_output",
        description: "阶段 2 生成的最终分析结果。",
        kind: "output",
        written_by: ["deconstructor"],
        read_by: [],
      },
    ];
  }

  if (graphType === "viral_tweet") {
    return [
      {
        name: "messages",
        label: "messages",
        description: "用户提供的 idea、资料和对话上下文。",
        kind: "input",
        written_by: [],
        read_by: ["strategist", "writer"],
      },
      {
        name: "viral_axis",
        label: "viral_axis",
        description: "阶段 1 提炼出的传播主轴，决定阶段 2 的核心角度。",
        kind: "intermediate",
        written_by: ["strategist"],
        read_by: ["writer"],
      },
      {
        name: "strategy_text",
        label: "strategy_text",
        description: "阶段 1 的完整策略文本，供阶段 2 生成推文时参考。",
        kind: "intermediate",
        written_by: ["strategist"],
        read_by: ["writer"],
      },
      {
        name: "final_output",
        label: "final_output",
        description: "阶段 2 生成的最终推文成稿。",
        kind: "output",
        written_by: ["writer"],
        read_by: [],
      },
    ];
  }

  if (graphType === "article_value") {
    return [
      {
        name: "messages",
        label: "messages",
        description: "原始文章内容和当前会话上下文。",
        kind: "input",
        written_by: [],
        read_by: ["value_router", "card_writer"],
      },
      {
        name: "value_routes",
        label: "value_routes",
        description: "阶段 1 选出的价值角度，比如 signal、framework、opportunity。",
        kind: "intermediate",
        written_by: ["value_router"],
        read_by: ["card_writer"],
      },
      {
        name: "route_reason",
        label: "route_reason",
        description: "阶段 1 对路由选择的简短理由，帮助阶段 2 聚焦真正有价值的点。",
        kind: "intermediate",
        written_by: ["value_router"],
        read_by: ["card_writer"],
      },
      {
        name: "final_output",
        label: "final_output",
        description: "阶段 2 生成的动态洞察卡片输出。",
        kind: "output",
        written_by: ["card_writer"],
        read_by: [],
      },
    ];
  }

  return [
    {
      name: "messages",
      label: "messages",
      description: "当前会话上下文，包含用户与助手的历史消息。",
      kind: "input",
      written_by: [],
      read_by: ["assistant"],
    },
    {
      name: "final_output",
      label: "final_output",
      description: "最终回复内容，会展示在聊天区并持久化到会话消息。",
      kind: "output",
      written_by: ["assistant"],
      read_by: [],
    },
  ];
}

function stateSlotKindLabel(kind?: string) {
  if (kind === "input") return "输入";
  if (kind === "intermediate") return "中间态";
  if (kind === "output") return "输出";
  return "状态";
}

export function GraphConfigPanel({
  configs,
  activeConfigId,
  isLoading,
  isSaving,
  activatingId,
  onCreateConfig,
  onUpdateConfig,
  onActivateConfig,
  onDeleteConfig,
}: GraphConfigPanelProps) {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [form, setForm] = useState<GraphFormState>(emptyForm);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [promptPreviews, setPromptPreviews] = useState<GraphNodePromptPreview[]>(
    getFallbackNodePreviews(emptyForm.graphType),
  );
  const [promptFields, setPromptFields] = useState<GraphPromptFieldPreview[]>(
    getFallbackPromptFields(emptyForm.graphType),
  );
  const [stateSlots, setStateSlots] = useState<GraphStateSlotPreview[]>(
    getFallbackStateSlots(emptyForm.graphType),
  );
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const nodePreviews = promptPreviews.length
    ? promptPreviews
    : getFallbackNodePreviews(form.graphType);
  const visiblePromptFields = promptFields.length
    ? promptFields
    : getFallbackPromptFields(form.graphType);
  const visibleStateSlots = stateSlots.length ? stateSlots : getFallbackStateSlots(form.graphType);

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  );

  useEffect(() => {
    if (configs.length === 0) {
      if (!isDirty) {
        setSelectedConfigId(null);
        setForm(emptyForm);
        setIsCreatingNew(true);
      }
      return;
    }

    if (isCreatingNew) {
      return;
    }

    const selectedConfigExists =
      selectedConfigId !== null && configs.some((config) => config.id === selectedConfigId);
    if (isDirty && selectedConfigExists) {
      return;
    }

    const nextId =
      selectedConfigExists
        ? selectedConfigId
        : activeConfigId ?? configs[0]?.id ?? null;

    setSelectedConfigId(nextId);
    const targetConfig = configs.find((config) => config.id === nextId);
    if (targetConfig) {
      setForm(toGraphFormState(targetConfig));
      setIsDirty(false);
    }
  }, [activeConfigId, configs, isCreatingNew, isDirty, selectedConfigId]);

  useEffect(() => {
    const fallbackPromptFields = getFallbackPromptFields(form.graphType);
    const fallbackPreviews = getFallbackNodePreviews(form.graphType);
    const fallbackStateSlots = getFallbackStateSlots(form.graphType);
    const controller = new AbortController();
    setPromptFields(fallbackPromptFields);
    setPromptPreviews(fallbackPreviews);
    setStateSlots(fallbackStateSlots);
    setPreviewError(null);
    const timer = window.setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const response: GraphPromptPreviewResponse = await previewGraphConfig(
          {
            graph_type: form.graphType,
            ...buildLegacyPromptPayload(form.promptValues),
            prompt_values: form.promptValues,
          },
          controller.signal,
        );
        setPromptFields(response.prompt_fields ?? fallbackPromptFields);
        setPromptPreviews(response.items);
        setStateSlots(response.state_slots ?? fallbackStateSlots);
        setPreviewError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setPromptFields(fallbackPromptFields);
        setPromptPreviews(fallbackPreviews);
        setStateSlots(fallbackStateSlots);
        setPreviewError(error instanceof Error ? error.message : "加载预览失败。");
      } finally {
        if (!controller.signal.aborted) {
          setIsPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [form.graphType, form.promptValues]);

  function getPromptFieldValue(key: string) {
    return form.promptValues[key] ?? "";
  }

  function updatePromptFieldValue(key: string, value: string) {
    setForm((current) => ({
      ...current,
      promptValues: {
        ...current.promptValues,
        [key]: value,
      },
    }));
    setIsDirty(true);
  }

  function updateForm<K extends keyof GraphFormState>(key: K, value: GraphFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
  }

  function confirmDiscardUnsavedChanges() {
    return !isDirty || confirm("当前表单有未保存修改，确认放弃这些修改？");
  }

  function resetToNewConfig() {
    setIsCreatingNew(true);
    setSelectedConfigId(null);
    setIsDirty(false);
    setForm(emptyForm);
    setNotice(null);
  }

  function selectConfig(config: GraphConfigRecord) {
    if (!confirmDiscardUnsavedChanges()) return;
    setIsCreatingNew(false);
    setSelectedConfigId(config.id);
    setIsDirty(false);
    setForm(toGraphFormState(config));
    setNotice(null);
  }

  function createNewConfig() {
    if (!confirmDiscardUnsavedChanges()) return;
    resetToNewConfig();
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setNotice({ type: "error", text: "请填写配置名称。" });
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        graph_type: form.graphType,
        ...buildLegacyPromptPayload(form.promptValues),
        prompt_values: form.promptValues,
      };

      const saved = form.id
        ? await onUpdateConfig({ configId: form.id, payload: payload as GraphConfigUpdateRequest })
        : await onCreateConfig(payload as GraphConfigCreateRequest);
      setIsCreatingNew(false);
      setSelectedConfigId(saved.id);
      setIsDirty(false);
      setForm(toGraphFormState(saved));
      setNotice({ type: "success", text: form.id ? "图配置已更新。" : "图配置已创建。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存失败。" });
    }
  }

  async function handleActivate(configId: number) {
    if (!confirmDiscardUnsavedChanges()) return;
    try {
      const activated = await onActivateConfig(configId);
      setIsCreatingNew(false);
      setSelectedConfigId(activated.id);
      setIsDirty(false);
      setForm(toGraphFormState(activated));
      setNotice({ type: "success", text: `已将 ${activated.name} 设为新会话默认工作流。` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "设置默认失败。" });
    }
  }

  async function handleDelete(configId: number) {
    if (!confirm("确认删除此配置？")) return;
    try {
      await onDeleteConfig(configId);
      if (selectedConfigId === configId) {
        resetToNewConfig();
      }
      setNotice({ type: "success", text: "图配置已删除。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "删除失败。" });
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-950">工作流与图配置</h2>
          <p className="mt-1 text-sm text-slate-500">可保存多个工作流；“默认”仅影响新建对话，已有对话可单独切换。</p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              加载中
            </div>
          ) : null}
          <Button type="button" variant="secondary" className="h-10 px-3" onClick={createNewConfig}>
            <Plus className="h-4 w-4" />
            新建
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">已保存配置</div>
          {configs.length > 0 ? (
            <div className="space-y-3">
              {configs.map((config) => {
                const isSelected = selectedConfig?.id === config.id;
                return (
                  <div
                    key={config.id}
                    className={cn(
                      "rounded-3xl border p-4 transition-colors",
                      isSelected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-900",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" className="flex-1 text-left" onClick={() => selectConfig(config)}>
                        <div className="text-sm font-semibold">{config.name}</div>
                        <div className={cn("mt-1 text-xs", isSelected ? "text-slate-300" : "text-slate-500")}>
                          类型: {config.graph_type}
                        </div>
                      </button>
                      {config.is_active ? (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            isSelected ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700",
                          )}
                        >
                          默认
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        variant={isSelected ? "secondary" : "default"}
                        className={cn("h-9 px-3 text-xs", !isSelected && "shadow-none")}
                        onClick={() => selectConfig(config)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                        onClick={() => void handleActivate(config.id)}
                        disabled={config.is_active || activatingId === config.id}
                      >
                        {activatingId === config.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}{" "}
                        设为默认
                      </Button>
                      {!config.is_active ? (
                        <button
                          type="button"
                          className={cn(
                            "ml-auto flex items-center justify-center rounded-xl p-2.5 transition-colors",
                            isSelected
                              ? "bg-white/10 text-slate-300 hover:bg-rose-500/20 hover:text-rose-400"
                              : "bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500",
                          )}
                          onClick={() => void handleDelete(config.id)}
                          title="删除配置"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              还没有配置工作流。
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              {isCreatingNew || !form.id ? "新建配置" : "编辑配置"}
            </div>
            <div className="text-xs text-slate-500">
              {isDirty ? "有未保存修改" : !isCreatingNew && form.id ? `ID #${form.id}` : null}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">配置名称</label>
            <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">内置处理拓扑</label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              value={form.graphType}
              onChange={(event) => updateForm("graphType", event.target.value as GraphType)}
            >
              <option value="simple_chat">简单对话 (Simple Chat)</option>
              <option value="summary_analysis">总结分析 (Summary & Analysis)</option>
              <option value="viral_tweet">爆款推文 (Viral Tweet)</option>
              <option value="article_value">文章价值卡片 (Article Value Cards)</option>
            </select>
            <p className="text-xs text-slate-500">新增拓扑时优先注册 graph contract、prompt defaults 和 node factory，不再扩散到多个 if/else。</p>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">State Pipeline 与 Effective Prompt</div>
                <div className="mt-1 text-xs text-slate-500">这里展示每个标准 node 真实读取哪些 state，以及最终会发送给模型的 prompt。</div>
              </div>
              <div className="text-xs text-slate-500">
                {isPreviewLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    更新中
                  </span>
                ) : (
                  "实时预览"
                )}
              </div>
            </div>
            {previewError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700">
                {previewError}
              </div>
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">State Slots</div>
              <div className="mt-3 space-y-3">
                {visibleStateSlots.map((slot) => (
                  <div key={slot.name} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{slot.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{slot.name}</div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {stateSlotKindLabel(slot.kind)}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{slot.description}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Written By</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(slot.written_by ?? []).length > 0 ? (
                            (slot.written_by ?? []).map((node) => (
                              <span key={node} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                                {node}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">外部输入</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Read By</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(slot.read_by ?? []).length > 0 ? (
                            (slot.read_by ?? []).map((node) => (
                              <span key={node} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                                {node}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">最终收口</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {nodePreviews.map((node) => (
                <div key={node.node} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{node.node_label}</div>
                      <div className="mt-1 text-xs text-slate-500">{node.node}</div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                      标准节点
                    </div>
                  </div>
                  <div className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    Prompt Source: {promptSourceLabel(node.prompt_source)}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{node.purpose}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reads</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(node.reads ?? []).map((slot) => (
                          <span key={slot} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                            {slot}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Writes</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(node.writes ?? []).map((slot) => (
                          <span key={slot} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                            {slot}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Effective Prompt
                    </div>
                    <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
                      {node.prompt_preview || "正在生成最终 prompt 预览..."}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {visiblePromptFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">{field.label}</label>
                  <span className="text-xs text-slate-500">{field.description}</span>
                </div>
                <textarea
                  className={cn(
                    "flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2",
                    field.key === "deconstructor_prompt" ? "min-h-[160px]" : "min-h-[120px]",
                    field.key === "system_prompt" ? "min-h-[140px]" : null,
                  )}
                  value={getPromptFieldValue(field.key)}
                  onChange={(event) => updatePromptFieldValue(field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>

          {notice ? (
            <div
              className={cn(
                "rounded-2xl px-4 py-3 text-sm",
                notice.type === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-rose-200 bg-rose-50 text-rose-700",
              )}
            >
              {notice.type === "success" ? (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {notice.text}
                </span>
              ) : (
                notice.text
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {form.id ? "保存修改" : "创建配置"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
