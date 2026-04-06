import re

FILE_PATH = "/Users/liuxinxin/Documents/GitHub/jeeves/frontend/components/assistant-workspace.tsx"

with open(FILE_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "CheckCircle2,",
    "CheckCircle2,\n  Trash,\n  Network,"
)

# 2. Types
types_add = """
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
"""
content = content.replace("type FormState = {", types_add + "\ntype FormState = {")

# 3. States
states_add = """
  const [settingsSection, setSettingsSection] = useState<"model" | "graph">("model");
  
  const [graphConfigs, setGraphConfigs] = useState<SavedGraphConfig[]>([]);
  const [graphForm, setGraphForm] = useState<GraphFormState>(emptyGraphForm);
  const [isSavingGraph, setIsSavingGraph] = useState(false);
  const [activatingGraphId, setActivatingGraphId] = useState<number | null>(null);
"""
content = content.replace(
    'const [settingsSection, setSettingsSection] = useState<"model">("model");',
    states_add
)

# 4. loadSettings & graph APIs
load_settings_mod = """
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
"""
content = re.sub(
    r'async function loadSettings\(preferredConfigId\?:\s*number\s*\|\s*null\)\s*\{.*?(?=function openSettings\(\))',
    load_settings_mod + "\n  ",
    content,
    flags=re.DOTALL
)

# 5. Delete method
delete_method = """
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
"""
content = content.replace("async function handleNewConversation() {", delete_method + "\n  async function handleNewConversation() {")

# 6. Graph Handlers
graph_handlers = """
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

  function handleCreateNewGraphConfig() {
    setGraphForm(emptyGraphForm);
    setSettingsNotice(null);
  }
"""
content = content.replace("function updateForm<K ", graph_handlers + "\n  function updateForm<K ")

# Fix apiKey placeholder
api_key_field = """
                          <label className="text-sm font-medium text-slate-700">API Key</label>
                          <Input
                            type="password"
                            placeholder={form.id ? "已保存配置 (留空则不修改)" : "API Key"}
                            value={form.apiKey}
                            onChange={(event) => updateForm("apiKey", event.target.value)}
                          />
"""
content = re.sub(
    r'<label className="text-sm font-medium text-slate-700">API Key</label>\s*<Input\s*type="password"\s*value=\{form\.apiKey\}\s*onChange=\{\(event\) => updateForm\("apiKey", event\.target\.value\)\}\s*/>',
    api_key_field,
    content
)

content = content.replace(
    '<Input value={form.apiKey} onChange={(event) => updateForm("apiKey", event.target.value)} />',
    '<Input type="password" placeholder={form.id ? "已保存配置 (留空则不修改)" : "API Key"} value={form.apiKey} onChange={(event) => updateForm("apiKey", event.target.value)} />'
)

content = content.replace(
    'if (!form.apiKey.trim()) throw new Error("请填写 API Key。");',
    'if (!form.id && !form.apiKey.trim()) throw new Error("请填写 API Key。");'
)

# New conversation UI with Trash
old_conv_map = """
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  "w-full rounded-3xl border px-4 py-3 text-left transition-colors",
                  conversation.id === activeConversationId
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                )}
                onClick={() => void handleSelectConversation(conversation.id)}
              >
                <div className="truncate text-sm font-semibold">{conversation.title}</div>
                <div
                  className={cn(
                    "mt-1 line-clamp-2 text-xs leading-5",
                    conversation.id === activeConversationId ? "text-slate-300" : "text-slate-500",
                  )}
                >
                  {conversation.preview || "暂无消息"}
                </div>
              </button>
            ))}
"""
new_conv_map = """
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
"""
content = content.replace(old_conv_map.strip(), new_conv_map.strip())

# Tabs in Sidebar
tabs = """
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
"""
content = re.sub(
    r'<button\s*type="button"\s*className=\{cn\(\s*"w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors",\s*settingsSection === "model"\s*\?\s*"bg-slate-950 text-white"\s*:\s*"bg-white text-slate-700 hover:bg-slate-100",\s*\)\}\s*onClick=\{\(\) => setSettingsSection\("model"\)\}\s*>\s*模型配置\s*</button>',
    tabs,
    content,
    flags=re.DOTALL
)

graph_ui_end_target = """                              <Button
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
                        </div>"""
graph_ui_end = """                    </>
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
                            <label className="text-sm font-medium text-slate-700">工作流类型</label>
                            <Input value={graphForm.graphType} onChange={(e) => updateGraphForm("graphType", e.target.value)} placeholder="如: simple_chat" />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">系统提示词 (System Prompt)</label>
                            <textarea 
                              className="flex min-h-[140px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={graphForm.systemPrompt} onChange={(e) => updateGraphForm("systemPrompt", e.target.value)} 
                              placeholder="You are a helpful assistant..."
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
                  )}"""

content = content.replace(graph_ui_end_target, graph_ui_end_target + "\\n" + graph_ui_end)

with open(FILE_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("success!")
