"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Trash,
  Network,
  LoaderCircle,
  PanelRightClose,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import ChatAssistant from "@/components/chat-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

type RuntimeStatus = {
  status: string;
  configured: boolean;
  source: string | null;
  config_name: string | null;
  model: string | null;
  max_retries: number | null;
};

type ConversationSummary = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  preview: string;
  message_count: number;
};

type ConversationMessage = {
  id: number | string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
};

type ConversationDetailResponse = {
  conversation: {
    id: number;
    title: string;
    created_at: string;
    updated_at: string;
  };
  messages: Array<{
    id: number;
    conversation_id: number;
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
  }>;
};

type ConversationListResponse = {
  items: ConversationSummary[];
};

type SavedLLMConfig = {
  id: number;
  name: string;
  api_key: string;
  api_key_masked: string;
  model: string;
  base_url: string | null;
  temperature: number;
  max_retries: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LLMConfigListResponse = {
  items: SavedLLMConfig[];
  active_config_id: number | null;
};

type LLMConfigTestResponse = {
  success: boolean;
  message: string;
  response_preview: string | null;
};


type SavedGraphConfig = {
  id: number;
  name: string;
  graph_type: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type GraphConfigListResponse = {
  items: SavedGraphConfig[];
  active_config_id: number | null;
};

type GraphFormState = {
  id: number | null;
  name: string;
  graphType: string;
  systemPrompt: string;
};

const emptyGraphForm: GraphFormState = {
  id: null,
  name: "",
  graphType: "simple_chat",
  systemPrompt: "You are a helpful assistant.",
};

function toGraphFormState(config: SavedGraphConfig): GraphFormState {
  return {
    id: config.id,
    name: config.name,
    graphType: config.graph_type,
    systemPrompt: config.system_prompt,
  };
}

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

const emptyForm: FormState = {
  id: null,
  name: "",
  apiKey: "",
  model: "gpt-4o-mini",
  baseUrl: "",
  temperature: "0.2",
  maxRetries: "2",
};

function toFormState(config: SavedLLMConfig): FormState {
  return {
    id: config.id,
    name: config.name,
    apiKey: config.api_key,
    model: config.model,
    baseUrl: config.base_url ?? "",
    temperature: String(config.temperature),
    maxRetries: String(config.max_retries),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || "请求失败。");
  }
  return payload as T;
}

function parseSSEEvent(block: string): { event: string; data: Record<string, unknown> } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export default function AssistantWorkspace() {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const [settingsSection, setSettingsSection] = useState<"model" | "graph">("model");
  
  const [graphConfigs, setGraphConfigs] = useState<SavedGraphConfig[]>([]);
  const [graphForm, setGraphForm] = useState<GraphFormState>(emptyGraphForm);
  const [isSavingGraph, setIsSavingGraph] = useState(false);
  const [activatingGraphId, setActivatingGraphId] = useState<number | null>(null);

  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [configs, setConfigs] = useState<SavedLLMConfig[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<Notice | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  async function refreshRuntimeStatus() {
    const health = await fetchJson<RuntimeStatus>(`${API_URL}/api/health`);
    setRuntimeStatus(health);
    return health;
  }

  async function refreshConversations() {
    const data = await fetchJson<ConversationListResponse>(`${API_URL}/api/conversations`);
    setConversations(data.items);
    return data.items;
  }

  async function refreshGraphConfigs() {
    try {
      const data = await fetchJson<GraphConfigListResponse>(`${API_URL}/api/graph-configs`);
      setGraphConfigs(data.items);
      return data.items;
    } catch {
      return [];
    }
  }

  async function handleActivateGraphConfigFromChat(configId: number) {
    try {
      await fetchJson<SavedGraphConfig>(`${API_URL}/api/graph-configs/${configId}/activate`, { method: "POST" });
      await refreshGraphConfigs();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "切换工作流失败。");
    }
  }

  async function loadConversation(conversationId: number) {
    setIsLoadingConversation(true);
    setChatError(null);

    try {
      const detail = await fetchJson<ConversationDetailResponse>(`${API_URL}/api/conversations/${conversationId}`);
      setActiveConversationId(detail.conversation.id);
      setMessages(
        detail.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          created_at: message.created_at,
        })),
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "加载对话失败。");
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function ensureConversation() {
    const items = await refreshConversations();
    let targetId = items[0]?.id ?? null;

    if (!targetId) {
      const created = await fetchJson<{ id: number }>(`${API_URL}/api/conversations`, { method: "POST" });
      targetId = created.id;
      await refreshConversations();
    }

    if (targetId) {
      await loadConversation(targetId);
    }
  }

  async function initializeWorkspace() {
    setIsBootstrapping(true);

    try {
      await Promise.all([
        refreshRuntimeStatus(),
        ensureConversation(),
        refreshGraphConfigs()
      ]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "初始化失败。");
    } finally {
      setIsBootstrapping(false);
    }
  }

  useEffect(() => {
    void initializeWorkspace();
  }, []);

  
  async function loadSettings(preferredConfigId?: number | null, preferredGraphId?: number | null) {
    setIsLoadingSettings(true);

    try {
      const [configData, healthData, graphData] = await Promise.all([
        fetchJson<LLMConfigListResponse>(`${API_URL}/api/llm-configs`),
        fetchJson<RuntimeStatus>(`${API_URL}/api/health`),
        fetchJson<GraphConfigListResponse>(`${API_URL}/api/graph-configs`),
      ]);

      setConfigs(configData.items);
      setRuntimeStatus(healthData);
      setForm((current) => {
        const targetId = preferredConfigId ?? current.id ?? configData.active_config_id ?? configData.items[0]?.id ?? null;
        const selected = configData.items.find((item) => item.id === targetId);
        return selected ? toFormState(selected) : emptyForm;
      });
      
      setGraphConfigs(graphData.items);
      setGraphForm((current) => {
        const targetId = preferredGraphId ?? current.id ?? graphData.active_config_id ?? graphData.items[0]?.id ?? null;
        const selected = graphData.items.find((item) => item.id === targetId);
        return selected ? toGraphFormState(selected) : emptyGraphForm;
      });

    } catch (error) {
      setSettingsNotice({
        type: "error",
        text: error instanceof Error ? error.message : "加载配置失败。",
      });
    } finally {
      setIsLoadingSettings(false);
    }
  }

  function openSettings() {
    setSettingsOpen(true);
    setSettingsSection("model");
    setSettingsNotice(null);
    void loadSettings();
  }

  async function handleSelectConversation(conversationId: number) {
    if (conversationId === activeConversationId || isLoadingConversation) return;
    await loadConversation(conversationId);
  }

  
  async function handleDeleteConversation(conversationId: number) {
    try {
      await fetchJson(`${API_URL}/api/conversations/${conversationId}`, { method: "DELETE" });
      const items = await refreshConversations();
      if (activeConversationId === conversationId) {
        if (items.length > 0) {
          await loadConversation(items[0].id);
        } else {
          await handleNewConversation();
        }
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "删除失败。");
    }
  }

  async function handleNewConversation() {
    setChatError(null);

    try {
      const created = await fetchJson<{ id: number }>(`${API_URL}/api/conversations`, { method: "POST" });
      await refreshConversations();
      await loadConversation(created.id);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "创建对话失败。");
    }
  }

  
  function updateGraphForm<K extends keyof GraphFormState>(key: K, value: GraphFormState[K]) {
    setGraphForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSaveGraphConfig() {
    if (!graphForm.name.trim()) {
      setSettingsNotice({ type: "error", text: "请填写配置名称" });
      return;
    }
    setIsSavingGraph(true);
    setSettingsNotice(null);
    try {
      const payload = {
        name: graphForm.name.trim(),
        graph_type: graphForm.graphType,
        system_prompt: graphForm.systemPrompt,
      };
      const saved = graphForm.id
        ? await fetchJson<SavedGraphConfig>(`${API_URL}/api/graph-configs/${graphForm.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await fetchJson<SavedGraphConfig>(`${API_URL}/api/graph-configs`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
      
      await loadSettings(null, saved.id);
      setSettingsNotice({ type: "success", text: graphForm.id ? "图配置已更新" : "图配置已创建" });
    } catch(error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setIsSavingGraph(false);
    }
  }

  async function handleActivateGraphConfig(configId: number) {
    setActivatingGraphId(configId);
    setSettingsNotice(null);
    try {
      const activated = await fetchJson<SavedGraphConfig>(`${API_URL}/api/graph-configs/${configId}/activate`, { method: "POST" });
      await loadSettings(null, activated.id);
      setSettingsNotice({ type: "success", text: `已启用 ${activated.name}。` });
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "启用失败。" });
    } finally {
      setActivatingGraphId(null);
    }
  }

  async function handleDeleteGraphConfig(configId: number) {
    if (!confirm("确认删除此配置？")) return;
    try {
      await fetchJson(`${API_URL}/api/graph-configs/${configId}`, { method: "DELETE" });
      await loadSettings();
      setSettingsNotice({ type: "success", text: "图配置已删除" });
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "删除失败。" });
    }
  }

  function handleCreateNewGraphConfig() {
    setGraphForm(emptyGraphForm);
    setSettingsNotice(null);
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateForm() {
    if (!form.name.trim()) throw new Error("请填写配置名称。");
    if (!form.model.trim()) throw new Error("请填写模型名称。");
    if (!form.id && !form.apiKey.trim()) throw new Error("请填写 API Key。");
  }

  function buildConfigPayload() {
    return {
      name: form.name.trim(),
      api_key: form.apiKey.trim(),
      model: form.model.trim(),
      base_url: form.baseUrl.trim() || null,
      temperature: Number(form.temperature || "0.2"),
      max_retries: Number(form.maxRetries || "2"),
    };
  }

  async function handleSaveConfig() {
    try {
      validateForm();
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "表单校验失败。" });
      return;
    }

    setIsSaving(true);
    setSettingsNotice(null);

    try {
      const payload = buildConfigPayload();
      const saved = form.id
        ? await fetchJson<SavedLLMConfig>(`${API_URL}/api/llm-configs/${form.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await fetchJson<SavedLLMConfig>(`${API_URL}/api/llm-configs`, {
            method: "POST",
            body: JSON.stringify(payload),
          });

      await loadSettings(saved.id);
      await refreshRuntimeStatus();
      setSettingsNotice({ type: "success", text: form.id ? "配置已更新。" : "配置已创建。" });
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "保存失败。" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConfig() {
    try {
      validateForm();
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "表单校验失败。" });
      return;
    }

    setIsTesting(true);
    setSettingsNotice(null);

    try {
      const payload = buildConfigPayload();
      const result = await fetchJson<LLMConfigTestResponse>(`${API_URL}/api/llm-configs/test`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSettingsNotice({
        type: "success",
        text: result.response_preview ? `${result.message} ${result.response_preview}` : result.message,
      });
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "测试失败。" });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleActivateConfig(configId: number) {
    setActivatingId(configId);
    setSettingsNotice(null);

    try {
      const activated = await fetchJson<SavedLLMConfig>(`${API_URL}/api/llm-configs/${configId}/activate`, {
        method: "POST",
      });
      await Promise.all([loadSettings(activated.id), refreshRuntimeStatus()]);
      setSettingsNotice({ type: "success", text: `已启用 ${activated.name}。` });
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "启用失败。" });
    } finally {
      setActivatingId(null);
    }
  }

  async function handleDeleteConfig(configId: number) {
    if (!confirm("确认删除此配置？")) return;
    try {
      await fetchJson(`${API_URL}/api/llm-configs/${configId}`, { method: "DELETE" });
      await loadSettings();
      setSettingsNotice({ type: "success", text: "配置已删除" });
    } catch (error) {
      setSettingsNotice({ type: "error", text: error instanceof Error ? error.message : "删除失败。" });
    }
  }

  function handleSelectConfig(config: SavedLLMConfig) {
    setForm(toFormState(config));
    setSettingsNotice(null);
  }

  function handleCreateNewConfig() {
    setForm(emptyForm);
    setSettingsNotice(null);
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending || !runtimeStatus?.configured) return;

    let conversationId = activeConversationId;
    if (!conversationId) {
      try {
        const created = await fetchJson<{ id: number }>(`${API_URL}/api/conversations`, { method: "POST" });
        conversationId = created.id;
        await refreshConversations();
        setActiveConversationId(conversationId);
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "创建对话失败。");
        return;
      }
    }

    const userMessageId = `temp-user-${Date.now()}`;
    const messageText = trimmed;

    setInput("");
    setChatError(null);
    setIsSending(true);
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        content: messageText,
      },
    ]);

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: messageText,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "流式请求失败。");
      }

      if (!response.body) {
        throw new Error("浏览器不支持流式响应。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes("\n\n")) {
          const separatorIndex = buffer.indexOf("\n\n");
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const parsed = parseSSEEvent(block);
          if (!parsed) continue;

          if (parsed.event === "chunk") {
            const node = typeof parsed.data.node === "string" ? parsed.data.node : "assistant";
            const text = typeof parsed.data.text === "string" ? parsed.data.text : "";
            if (!text) continue;
            
            setMessages((current) => {
              const tempId = `temp-${node}`;
              const exists = current.find(m => m.id === tempId);
              if (exists) {
                return current.map(m => m.id === tempId ? { ...m, content: m.content + text } : m);
              } else {
                return [...current, { id: tempId, role: "assistant", content: text as string }];
              }
            });
          }

          if (parsed.event === "done") {
            const finalMessages = parsed.data.messages as ConversationMessage[] | undefined;
            if (!finalMessages) continue;

            setMessages((current) => {
              let nextMessages = current.map((item) => {
                if (item.id === userMessageId) {
                  return { ...item, id: `synced-user-${Date.now()}` };
                }
                return item;
              }).filter((item) => !(item.role === "assistant" && String(item.id).startsWith("temp-")));
              
              return [...nextMessages, ...finalMessages];
            });
          }

          if (parsed.event === "error") {
            throw new Error(typeof parsed.data.message === "string" ? parsed.data.message : "流式请求失败。");
          }
        }
      }

      await refreshConversations();
      await refreshRuntimeStatus();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "发送消息失败。");
      if (conversationId) {
        await loadConversation(conversationId);
        await refreshConversations();
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-transparent">
      <aside className="hidden w-72 border-r border-slate-200/80 bg-white/70 p-4 backdrop-blur md:flex md:flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-display text-xl font-semibold text-slate-950">Jeeves</div>
            <div className="mt-1 text-sm text-slate-500">历史对话</div>
          </div>
          <Button type="button" size="icon" variant="secondary" onClick={() => void handleNewConversation()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 pr-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group relative w-full rounded-3xl border px-4 py-3 text-left transition-colors",
                  conversation.id === activeConversationId
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => void handleSelectConversation(conversation.id)}
                >
                    <div className="truncate text-sm font-semibold pr-6">{conversation.title}</div>
                    <div
                    className={cn(
                        "mt-1 line-clamp-2 text-xs leading-5",
                        conversation.id === activeConversationId ? "text-slate-300" : "text-slate-500",
                    )}
                    >
                    {conversation.preview || "暂无消息"}
                    </div>
                </button>
                <button
                    type="button"
                    className="absolute right-3 top-3 hidden group-hover:block p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-rose-500 transition-colors"
                    onClick={(e) => { e.stopPropagation(); void handleDeleteConversation(conversation.id); }}
                    title="删除对话"
                >
                    <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <section className="min-h-0 flex-1 p-4">
        <ChatAssistant
          className="h-full"
          title={activeConversation?.title ?? "New chat"}
          runtimeStatus={runtimeStatus}
          graphConfigs={graphConfigs}
          onActivateGraphConfig={(id) => void handleActivateGraphConfigFromChat(id)}
          messages={messages}
          input={input}
          error={chatError}
          isBootstrapping={isBootstrapping}
          isConversationLoading={isLoadingConversation}
          isSending={isSending}
          onInputChange={setInput}
          onSend={() => void handleSend()}
          onNewConversation={() => void handleNewConversation()}
          onOpenSettings={openSettings}
        />
      </section>

      {settingsOpen ? (
        <div className="fixed inset-0 z-40 flex bg-slate-950/30 backdrop-blur-[2px]">
          <button type="button" className="flex-1" aria-label="关闭设置" onClick={() => setSettingsOpen(false)} />
          <div className="h-full w-full max-w-5xl border-l border-slate-200 bg-white shadow-2xl">
            <div className="grid h-full min-h-0 md:grid-cols-[13rem_minmax(0,1fr)]">
              <aside className="border-b border-slate-200 bg-slate-50 p-5 md:border-b-0 md:border-r">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-xl font-semibold text-slate-950">设置</div>
                    <div className="mt-1 text-sm text-slate-500">以后可以继续扩展更多配置项</div>
                  </div>
                  <Button type="button" size="icon" variant="secondary" onClick={() => setSettingsOpen(false)}>
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-6 space-y-2">
                  
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2",
                      settingsSection === "model"
                        ? "bg-slate-950 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100",
                    )}
                    onClick={() => setSettingsSection("model")}
                  >
                    <Settings2 className="w-4 h-4" /> 
                    模型配置
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2",
                      settingsSection === "graph"
                        ? "bg-slate-950 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100",
                    )}
                    onClick={() => setSettingsSection("graph")}
                  >
                    <Network className="w-4 h-4" />
                    工作流配置
                  </button>

                </div>
              </aside>

              <div className="min-h-0">
                <ScrollArea className="h-full">
                  <div className="space-y-6 p-5 sm:p-6">
                    {settingsSection === "model" ? (
                      <>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-2xl font-semibold text-slate-950">模型配置</h2>
                        <p className="mt-1 text-sm text-slate-500">配置存储在 SQLite，可测试连接并启用。</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLoadingSettings ? (
                          <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            加载中
                          </div>
                        ) : null}
                        <Button type="button" variant="secondary" className="h-10 px-3" onClick={handleCreateNewConfig}>
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

                        {configs.length ? (
                          <div className="space-y-3">
                            {configs.map((config) => {
                              const isSelected = form.id === config.id;

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
                                    <button
                                      type="button"
                                      className="flex-1 text-left"
                                      onClick={() => handleSelectConfig(config)}
                                    >
                                      <div className="text-sm font-semibold">{config.name}</div>
                                      <div
                                        className={cn(
                                          "mt-1 text-xs",
                                          isSelected ? "text-slate-300" : "text-slate-500",
                                        )}
                                      >
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
                                      "mt-3 text-xs block truncate w-full max-w-[200px] sm:max-w-[300px]",
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
                                      onClick={() => handleSelectConfig(config)}
                                    >
                                      编辑
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="h-9 px-3 text-xs"
                                      onClick={() => void handleActivateConfig(config.id)}
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
                                      className="ml-auto p-1.5 text-slate-400 hover:text-white hover:bg-rose-500 rounded-md transition-colors"
                                      onClick={() => void handleDeleteConfig(config.id)}
                                      title="删除配置"
                                      disabled={isTesting || isSaving}
                                    >
                                      <Trash className="w-4 h-4" />
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
                            placeholder={form.id ? "已保存配置 (留空则不修改)" : "API Key"}
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

                        {settingsNotice ? (
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-3 text-sm",
                              settingsNotice.type === "success"
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700",
                            )}
                          >
                            {settingsNotice.type === "success" ? (
                              <span className="inline-flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                {settingsNotice.text}
                              </span>
                            ) : (
                              settingsNotice.text
                            )}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                          <Button type="button" onClick={() => void handleSaveConfig()} disabled={isSaving}>
                            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {form.id ? "保存修改" : "创建配置"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-11 px-5"
                            onClick={() => void handleTestConfig()}
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
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h2 className="font-display text-2xl font-semibold text-slate-950">工作流与图配置</h2>
                          <p className="mt-1 text-sm text-slate-500">动态配置后端处理图及节点提示词。</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isLoadingSettings ? (
                            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              加载中
                            </div>
                          ) : null}
                          <Button type="button" variant="secondary" className="h-10 px-3" onClick={handleCreateNewGraphConfig}>
                            <Plus className="h-4 w-4" />
                            新建
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-slate-900">已保存配置</div>
                          {graphConfigs.length ? (
                            <div className="space-y-3">
                              {graphConfigs.map((config) => {
                                const isSelected = graphForm.id === config.id;
                                return (
                                  <div key={config.id} className={cn("rounded-3xl border p-4 transition-colors", isSelected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900")}>
                                    <div className="flex items-start justify-between gap-3">
                                      <button type="button" className="flex-1 text-left" onClick={() => { setGraphForm(toGraphFormState(config)); setSettingsNotice(null); }}>
                                        <div className="text-sm font-semibold">{config.name}</div>
                                        <div className={cn("mt-1 text-xs", isSelected ? "text-slate-300" : "text-slate-500")}>
                                          类型: {config.graph_type}
                                        </div>
                                      </button>
                                      {config.is_active ? (
                                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", isSelected ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700")}>当前</span>
                                      ) : null}
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                      <Button type="button" variant={isSelected ? "secondary" : "default"} className={cn("h-9 px-3 text-xs", !isSelected && "shadow-none")} onClick={() => { setGraphForm(toGraphFormState(config)); setSettingsNotice(null); }}>编辑</Button>
                                      <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={() => void handleActivateGraphConfig(config.id)} disabled={config.is_active || activatingGraphId === config.id}>
                                        {activatingGraphId === config.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 启用
                                      </Button>
                                      {!config.is_active && (
                                        <button
                                          type="button"
                                          className={cn("ml-auto flex items-center justify-center rounded-xl p-2.5 transition-colors", isSelected ? "bg-white/10 text-slate-300 hover:bg-rose-500/20 hover:text-rose-400" : "bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500")}
                                          onClick={() => void handleDeleteGraphConfig(config.id)}
                                          title="删除配置"
                                        >
                                          <Trash className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">还没有配置工作流。</div>
                          )}
                        </div>

                        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-900">{graphForm.id ? "编辑配置" : "新建配置"}</div>
                            {graphForm.id ? <div className="text-xs text-slate-500">ID #{graphForm.id}</div> : null}
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">配置名称</label>
                            <Input value={graphForm.name} onChange={(e) => updateGraphForm("name", e.target.value)} />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">内置处理拓扑</label>
                            <select
                              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                              value={graphForm.graphType}
                              onChange={(e) => updateGraphForm("graphType", e.target.value)}
                            >
                              <option value="simple_chat">简单对话 (Simple Chat)</option>
                              <option value="summary_analysis">总结分析 (Summary & Analysis)</option>
                            </select>
                            <p className="text-xs text-slate-500">拓扑逻辑已在后端代码中硬编码实现，请根据所需处理流选择对应的标识。</p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-slate-700">系统提示词 (System Prompt)</label>
                              <span className="text-xs text-slate-500">此提示词将被注入到对应的节点中。</span>
                            </div>
                            <textarea 
                              className="flex min-h-[140px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={graphForm.systemPrompt} onChange={(e) => updateGraphForm("systemPrompt", e.target.value)} 
                              placeholder="在这里编写 Prompt（支持代码定义的占位符控制逻辑）"
                            />
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Button type="button" onClick={() => void handleSaveGraphConfig()} disabled={isSavingGraph}>
                              {isSavingGraph ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              {graphForm.id ? "保存修改" : "创建配置"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
