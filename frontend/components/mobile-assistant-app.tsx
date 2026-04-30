"use client";

import { useEffect, useState } from "react";
import { Menu, Plus, Trash, X } from "lucide-react";

import { ChatPane } from "@/components/chat-pane";
import { RunTracePanel } from "@/components/run-trace-panel";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssistantChatController } from "@/hooks/use-assistant-chat-controller";
import { useLikedCards } from "@/hooks/use-liked-cards";
import { useLLMConfigs } from "@/hooks/use-llm-configs";
import type { LikedCardCreateRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type SettingsSection = "model" | "graph" | "logs" | "likes";

type MobileAssistantAppProps = {
  authUsername?: string | null;
  onLogout?: () => void;
  isAuthMutating?: boolean;
};

export function MobileAssistantApp({
  authUsername,
  onLogout,
  isAuthMutating,
}: MobileAssistantAppProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("model");

  const {
    activeGraphId,
    chatStream,
    combinedChatError,
    conversationActionNotice,
    conversations,
    graphConfigs,
    handleActivateGraphFromChat,
    handleCreateConversation,
    handleDeleteConversation,
    handleSend,
    input,
    isBootstrapping,
    messages,
    runtimeStatusQuery,
    setChatError,
    setInput,
  } = useAssistantChatController();
  const llmConfigs = useLLMConfigs();
  const likedCards = useLikedCards({
    conversationId: conversations.activeConversationId,
    enabled: conversations.activeConversationId !== null,
  });

  useEffect(() => {
    setMenuOpen(false);
  }, [conversations.activeConversationId]);

  function openSettings(section: SettingsSection = "model") {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  async function handleLikeInsightCard(payload: LikedCardCreateRequest) {
    try {
      setChatError(null);
      await likedCards.likeCard(payload);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "点赞卡片失败。");
    }
  }

  async function handleUnlikeLikedCard(likedCardId: number) {
    try {
      setChatError(null);
      await likedCards.unlikeCard(likedCardId);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "取消点赞失败。");
    }
  }

  async function handleActivateModelFromChat(configId: number) {
    try {
      setChatError(null);
      chatStream.clearError();
      await llmConfigs.activateConfig(configId);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "切换模型失败。");
    }
  }

  return (
    <div className="relative h-[100dvh] min-h-[100dvh] overflow-hidden bg-[#f4efe4] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.22),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(14,165,233,0.18),transparent_28%),linear-gradient(180deg,#fff7ed_0%,#eef5f1_46%,#e7edf7_100%)]" />
      <div className="pointer-events-none absolute -left-24 top-28 h-48 w-48 rounded-full bg-white/45 blur-3xl" />
      <div className="pointer-events-none absolute bottom-20 right-[-7rem] h-64 w-64 rounded-full bg-amber-200/35 blur-3xl" />

      {menuOpen ? (
        <div className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <aside
            className="flex h-full w-[88vw] max-w-sm flex-col bg-white/96 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-xl font-semibold">Jeeves</div>
                <div className="mt-1 text-xs text-slate-500">桌面和手机共用历史对话</div>
              </div>
              <Button type="button" size="icon" variant="secondary" onClick={() => setMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Button type="button" className="mb-4 w-full" onClick={() => void handleCreateConversation()}>
              <Plus className="h-4 w-4" />
              新建对话
            </Button>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 pr-2">
                {conversations.conversations.length > 0 ? (
                  conversations.conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={cn(
                        "group relative rounded-3xl border px-4 py-3 transition",
                        conversation.id === conversations.activeConversationId
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          void conversations.selectConversation(conversation.id);
                          setMenuOpen(false);
                        }}
                      >
                        <div className="truncate pr-8 text-sm font-semibold">{conversation.title}</div>
                        {conversation.graph_config_name ? (
                          <div
                            className={cn(
                              "mt-1 text-[11px] font-medium",
                              conversation.id === conversations.activeConversationId
                                ? "text-slate-300"
                                : "text-slate-500",
                            )}
                          >
                            工作流: {conversation.graph_config_name}
                          </div>
                        ) : null}
                        <div
                          className={cn(
                            "mt-1 line-clamp-2 text-xs leading-5",
                            conversation.id === conversations.activeConversationId
                              ? "text-slate-300"
                              : "text-slate-500",
                          )}
                        >
                          {conversation.preview || "暂无消息"}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-500 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteConversation(conversation.id);
                        }}
                        title="删除对话"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    暂时没有历史对话。
                  </div>
                )}
              </div>
            </ScrollArea>
          </aside>
        </div>
      ) : null}

      {traceOpen ? (
        <div className="fixed inset-0 z-30 bg-slate-950/35 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-sm">
          <RunTracePanel
            activeConversationId={conversations.activeConversationId}
            activeConversationTitle={conversations.activeConversation?.title ?? null}
            onClose={() => setTraceOpen(false)}
          />
        </div>
      ) : null}

      <main className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-2 p-2 pt-[calc(env(safe-area-inset-top)+0.55rem)]">
        <header className="flex shrink-0 items-center justify-between gap-3 rounded-[1.35rem] border border-white/70 bg-white/75 px-2.5 py-1.5 shadow-[0_10px_26px_rgba(15,23,42,0.09)] backdrop-blur-xl">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 rounded-xl"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-700">
              Jeeves Mobile
            </div>
            <div className="truncate text-[13px] font-semibold text-slate-950">
              完整功能工作台
            </div>
          </div>
          <div className="h-9 w-9" />
        </header>

        <section className="min-h-0 flex-1">
          <ChatPane
            title={conversations.activeConversation?.title ?? "New chat"}
            activeConversationId={conversations.activeConversationId}
            runtimeStatus={runtimeStatusQuery.data ?? null}
            modelConfigs={llmConfigs.configs}
            activeModelConfigId={llmConfigs.activeConfigId}
            isModelLoading={llmConfigs.configsQuery.isLoading || runtimeStatusQuery.isLoading}
            modelActivatingId={llmConfigs.activatingId}
            graphConfigs={graphConfigs.configs}
            activeGraphId={activeGraphId}
            messages={messages}
            streamingMessages={chatStream.streamingMessages}
            likedCardBySource={likedCards.likedCardBySource}
            isLikeMutating={likedCards.likingCard || likedCards.unlikingCard}
            notice={conversationActionNotice}
            input={input}
            error={combinedChatError}
            isBootstrapping={isBootstrapping}
            isConversationLoading={conversations.isConversationLoading}
            isSending={chatStream.isSending}
            onInputChange={setInput}
            onSend={() => void handleSend()}
            onNewConversation={handleCreateConversation}
            onLikeInsightCard={handleLikeInsightCard}
            onUnlikeLikedCard={handleUnlikeLikedCard}
            onActivateModelConfig={handleActivateModelFromChat}
            onOpenSettings={() => openSettings("model")}
            onOpenLikedCards={() => openSettings("likes")}
            onToggleTrace={() => setTraceOpen((current) => !current)}
            onActivateGraphConfig={(configId) => void handleActivateGraphFromChat(configId)}
            isTraceOpen={traceOpen}
            authUsername={authUsername}
            onLogout={onLogout}
            isAuthMutating={isAuthMutating}
          />
        </section>
      </main>

      <SettingsDrawer
        isOpen={settingsOpen}
        section={settingsSection}
        onClose={() => setSettingsOpen(false)}
        onSectionChange={setSettingsSection}
        runtimeStatus={runtimeStatusQuery.data ?? null}
        modelConfigs={llmConfigs.configs}
        activeModelConfigId={llmConfigs.activeConfigId}
        isModelLoading={llmConfigs.configsQuery.isLoading || runtimeStatusQuery.isLoading}
        isModelSaving={llmConfigs.isSaving}
        isModelTesting={llmConfigs.isTesting}
        modelActivatingId={llmConfigs.activatingId}
        onCreateModelConfig={llmConfigs.createConfig}
        onUpdateModelConfig={llmConfigs.updateConfig}
        onActivateModelConfig={llmConfigs.activateConfig}
        onDeleteModelConfig={llmConfigs.deleteConfig}
        onTestModelConfig={llmConfigs.testConfig}
        graphConfigs={graphConfigs.configs}
        activeGraphConfigId={graphConfigs.activeConfigId}
        activeConversationId={conversations.activeConversationId}
        activeConversationTitle={conversations.activeConversation?.title ?? null}
        isGraphLoading={graphConfigs.configsQuery.isLoading}
        isGraphSaving={graphConfigs.isSaving}
        graphActivatingId={graphConfigs.activatingId}
        onCreateGraphConfig={graphConfigs.createConfig}
        onUpdateGraphConfig={graphConfigs.updateConfig}
        onActivateGraphConfig={graphConfigs.activateConfig}
        onDeleteGraphConfig={graphConfigs.deleteConfig}
      />
    </div>
  );
}
