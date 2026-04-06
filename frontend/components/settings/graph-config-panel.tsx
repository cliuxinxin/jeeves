"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, RefreshCw, Save, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  GraphConfigCreateRequest,
  GraphConfigRecord,
  GraphConfigUpdateRequest,
  GraphType,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";

type GraphFormState = {
  id: number | null;
  name: string;
  graphType: GraphType;
  systemPrompt: string;
  analyzerPrompt: string;
  deconstructorPrompt: string;
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
  systemPrompt: "You are a helpful assistant.",
  analyzerPrompt: "",
  deconstructorPrompt: "",
};

function toGraphFormState(config: GraphConfigRecord): GraphFormState {
  return {
    id: config.id,
    name: config.name,
    graphType: config.graph_type,
    systemPrompt: config.system_prompt,
    analyzerPrompt: config.analyzer_prompt,
    deconstructorPrompt: config.deconstructor_prompt,
  };
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
  const [form, setForm] = useState<GraphFormState>(emptyForm);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  );

  useEffect(() => {
    if (configs.length === 0) {
      setSelectedConfigId(null);
      setForm(emptyForm);
      return;
    }

    const nextId =
      selectedConfigId && configs.some((config) => config.id === selectedConfigId)
        ? selectedConfigId
        : activeConfigId ?? configs[0]?.id ?? null;

    setSelectedConfigId(nextId);
    const targetConfig = configs.find((config) => config.id === nextId);
    if (targetConfig) {
      setForm(toGraphFormState(targetConfig));
    }
  }, [activeConfigId, configs, selectedConfigId]);

  function updateForm<K extends keyof GraphFormState>(key: K, value: GraphFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectConfig(config: GraphConfigRecord) {
    setSelectedConfigId(config.id);
    setForm(toGraphFormState(config));
    setNotice(null);
  }

  function createNewConfig() {
    setSelectedConfigId(null);
    setForm(emptyForm);
    setNotice(null);
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
        system_prompt: form.systemPrompt,
        analyzer_prompt: form.analyzerPrompt,
        deconstructor_prompt: form.deconstructorPrompt,
      };

      const saved = form.id
        ? await onUpdateConfig({ configId: form.id, payload: payload as GraphConfigUpdateRequest })
        : await onCreateConfig(payload as GraphConfigCreateRequest);
      setSelectedConfigId(saved.id);
      setForm(toGraphFormState(saved));
      setNotice({ type: "success", text: form.id ? "图配置已更新。" : "图配置已创建。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存失败。" });
    }
  }

  async function handleActivate(configId: number) {
    try {
      const activated = await onActivateConfig(configId);
      setSelectedConfigId(activated.id);
      setForm(toGraphFormState(activated));
      setNotice({ type: "success", text: `已启用 ${activated.name}。` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "启用失败。" });
    }
  }

  async function handleDelete(configId: number) {
    if (!confirm("确认删除此配置？")) return;
    try {
      await onDeleteConfig(configId);
      createNewConfig();
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
          <p className="mt-1 text-sm text-slate-500">动态配置后端处理图及节点提示词。</p>
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
                          当前
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
                        启用
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
            <div className="text-sm font-semibold text-slate-900">{form.id ? "编辑配置" : "新建配置"}</div>
            {form.id ? <div className="text-xs text-slate-500">ID #{form.id}</div> : null}
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
            </select>
            <p className="text-xs text-slate-500">新增拓扑时只需要注册 graph builder，不再扩散到多个 if/else。</p>
          </div>

          {form.graphType === "summary_analysis" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">阶段 1 提示词（analyzer）</label>
                  <span className="text-xs text-slate-500">用于“初步分析/类型判定”节点。</span>
                </div>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                  value={form.analyzerPrompt}
                  onChange={(event) => updateForm("analyzerPrompt", event.target.value)}
                  placeholder="例如：你是一个专业文本分类器..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">阶段 2 提示词（deconstructor）</label>
                  <span className="text-xs text-slate-500">用于“拆解分析”节点。</span>
                </div>
                <textarea
                  className="flex min-h-[160px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                  value={form.deconstructorPrompt}
                  onChange={(event) => updateForm("deconstructorPrompt", event.target.value)}
                  placeholder="例如：请按要点、结构、风险、建议输出..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">系统提示词 (System Prompt)</label>
                <span className="text-xs text-slate-500">此提示词将被注入到对应的节点中。</span>
              </div>
              <textarea
                className="flex min-h-[140px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                value={form.systemPrompt}
                onChange={(event) => updateForm("systemPrompt", event.target.value)}
                placeholder="在这里编写 Prompt"
              />
            </div>
          )}

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
