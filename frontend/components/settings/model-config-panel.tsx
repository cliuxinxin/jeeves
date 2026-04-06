"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, RefreshCw, Save, ShieldCheck, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  HealthResponse,
  LLMConfigCreateRequest,
  LLMConfigRecord,
  LLMConfigTestRequest,
  LLMConfigTestResponse,
  LLMConfigUpdateRequest,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";

type FormState = {
  id: number | null;
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: string;
  maxRetries: string;
};

type Notice = {
  type: "success" | "error";
  text: string;
};

type ModelConfigPanelProps = {
  runtimeStatus: HealthResponse | null;
  configs: LLMConfigRecord[];
  activeConfigId: number | null;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  activatingId: number | null;
  onCreateConfig: (payload: LLMConfigCreateRequest) => Promise<LLMConfigRecord>;
  onUpdateConfig: (args: { configId: number; payload: LLMConfigUpdateRequest }) => Promise<LLMConfigRecord>;
  onActivateConfig: (configId: number) => Promise<LLMConfigRecord>;
  onDeleteConfig: (configId: number) => Promise<void>;
  onTestConfig: (payload: LLMConfigTestRequest) => Promise<LLMConfigTestResponse>;
};

const emptyForm: FormState = {
  id: null,
  name: "",
  apiKey: "",
  model: "gpt-4o-mini",
  baseUrl: "",
  temperature: "0.2",
  maxRetries: "2",
};

function toFormState(config: LLMConfigRecord): FormState {
  return {
    id: config.id,
    name: config.name,
    apiKey: "",
    model: config.model,
    baseUrl: config.base_url ?? "",
    temperature: String(config.temperature),
    maxRetries: String(config.max_retries),
  };
}

export function ModelConfigPanel({
  runtimeStatus,
  configs,
  activeConfigId,
  isLoading,
  isSaving,
  isTesting,
  activatingId,
  onCreateConfig,
  onUpdateConfig,
  onActivateConfig,
  onDeleteConfig,
  onTestConfig,
}: ModelConfigPanelProps) {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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
      setForm(toFormState(targetConfig));
    }
  }, [activeConfigId, configs, selectedConfigId]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectConfig(config: LLMConfigRecord) {
    setSelectedConfigId(config.id);
    setForm(toFormState(config));
    setNotice(null);
  }

  function createNewConfig() {
    setSelectedConfigId(null);
    setForm(emptyForm);
    setNotice(null);
  }

  function buildConfigPayload(): LLMConfigCreateRequest | LLMConfigUpdateRequest {
    const basePayload = {
      name: form.name.trim(),
      model: form.model.trim(),
      base_url: form.baseUrl.trim() || null,
      temperature: Number(form.temperature || "0.2"),
      max_retries: Number(form.maxRetries || "2"),
    };

    if (!form.id) {
      return {
        ...basePayload,
        api_key: form.apiKey.trim(),
      };
    }

    return {
      ...basePayload,
      ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
    };
  }

  function validateForm() {
    if (!form.name.trim()) throw new Error("请填写配置名称。");
    if (!form.model.trim()) throw new Error("请填写模型名称。");
    if (!form.id && !form.apiKey.trim()) throw new Error("请填写 API Key。");
  }

  async function handleSave() {
    try {
      validateForm();
      const payload = buildConfigPayload();
      const saved = form.id
        ? await onUpdateConfig({ configId: form.id, payload: payload as LLMConfigUpdateRequest })
        : await onCreateConfig(payload as LLMConfigCreateRequest);
      setSelectedConfigId(saved.id);
      setForm(toFormState(saved));
      setNotice({ type: "success", text: form.id ? "配置已更新。" : "配置已创建。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存失败。" });
    }
  }

  async function handleTest() {
    try {
      validateForm();
      if (!form.apiKey.trim()) {
        throw new Error("测试连接时请填写 API Key。");
      }
      const result = await onTestConfig({
        api_key: form.apiKey.trim(),
        model: form.model.trim(),
        base_url: form.baseUrl.trim() || null,
        temperature: Number(form.temperature || "0.2"),
        max_retries: Number(form.maxRetries || "2"),
      });
      setNotice({
        type: "success",
        text: result.response_preview ? `${result.message} ${result.response_preview}` : result.message,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "测试失败。" });
    }
  }

  async function handleActivate(configId: number) {
    try {
      const activated = await onActivateConfig(configId);
      setSelectedConfigId(activated.id);
      setForm(toFormState(activated));
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
      setNotice({ type: "success", text: "配置已删除。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "删除失败。" });
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-950">模型配置</h2>
          <p className="mt-1 text-sm text-slate-500">配置存储在 SQLite，可测试连接并启用。</p>
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

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          当前启用
        </div>
        <div className="mt-3 text-sm text-slate-600">
          {runtimeStatus?.configured ? (
            <>
              <div className="font-medium text-slate-900">
                {runtimeStatus.config_name} · {runtimeStatus.model}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                来源：{runtimeStatus.source === "database" ? "SQLite" : "环境变量"} · 重试{" "}
                {runtimeStatus.max_retries ?? 0} 次
              </div>
            </>
          ) : (
            <div>当前还没有可用模型。</div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
                          {config.model}
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

                    <div
                      className={cn(
                        "mt-3 block w-full max-w-[300px] truncate text-xs",
                        isSelected ? "text-slate-300" : "text-slate-500",
                      )}
                    >
                      {config.api_key_masked} · 重试 {config.max_retries} 次
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
                        )}
                        启用
                      </Button>
                      <button
                        type="button"
                        className="ml-auto rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-500 hover:text-white"
                        onClick={() => void handleDelete(config.id)}
                        title="删除配置"
                        disabled={isTesting || isSaving}
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              还没有保存任何模型配置。
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              {form.id ? "编辑模型配置" : "新建模型配置"}
            </div>
            {form.id ? <div className="text-xs text-slate-500">ID #{form.id}</div> : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">配置名称</label>
            <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">模型</label>
            <Input value={form.model} onChange={(event) => updateForm("model", event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">API Key</label>
            <Input
              type="password"
              placeholder={form.id ? "已保存配置（留空则不修改）" : "API Key"}
              value={form.apiKey}
              onChange={(event) => updateForm("apiKey", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Base URL</label>
            <Input
              placeholder="https://api.openai.com/v1"
              value={form.baseUrl}
              onChange={(event) => updateForm("baseUrl", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Temperature</label>
              <Input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={(event) => updateForm("temperature", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">重试次数</label>
              <Input
                type="number"
                min="0"
                max="10"
                value={form.maxRetries}
                onChange={(event) => updateForm("maxRetries", event.target.value)}
              />
            </div>
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
            <Button
              type="button"
              variant="secondary"
              className="h-11 px-5"
              onClick={() => void handleTest()}
              disabled={isTesting}
            >
              {isTesting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              测试连接
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
