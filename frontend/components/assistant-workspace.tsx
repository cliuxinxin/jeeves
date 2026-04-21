"use client";

import { useState } from "react";

import { ChatPane } from "@/components/chat-pane";
import { ConversationSidebar } from "@/components/conversation-sidebar";
import { RunTracePanel } from "@/components/run-trace-panel";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { useAssistantChatController } from "@/hooks/use-assistant-chat-controller";
import { useLikedCards } from "@/hooks/use-liked-cards";
import { useLLMConfigs } from "@/hooks/use-llm-configs";
import type { LikedCardCreateRequest } from "@/lib/api/client";

type SettingsSection = "model" | "graph" | "logs" | "likes";

type AssistantWorkspaceProps = {
  authUsername?: string | null;
  onLogout?: () => void;
  isAuthMutating?: boolean;
};

export default function AssistantWorkspace({
  authUsername,
  onLogout,
  isAuthMutating,
}: AssistantWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("model");
  const [traceOpen, setTraceOpen] = useState(false);

  const assistantChat = useAssistantChatController();
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
  } = assistantChat;
  const llmConfigs = useLLMConfigs();
  const likedCards = useLikedCards({
    conversationId: conversations.activeConversationId,
    enabled: conversations.activeConversationId !== null,
  });

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

  function openSettings(section: SettingsSection = "model") {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 bg-transparent">
      <ConversationSidebar
        conversations={conversations.conversations}
        activeConversationId={conversations.activeConversationId}
        onSelectConversation={(conversationId) => void conversations.selectConversation(conversationId)}
        onDeleteConversation={(conversationId) => void handleDeleteConversation(conversationId)}
        onCreateConversation={() => void handleCreateConversation()}
      />

      <section className="min-h-0 flex-1 p-4">
        <div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
          <div className="min-h-0 min-w-0 flex-1">
            <ChatPane
              title={conversations.activeConversation?.title ?? "New chat"}
              activeConversationId={conversations.activeConversationId}
              runtimeStatus={runtimeStatusQuery.data ?? null}
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
              onNewConversation={() => void handleCreateConversation()}
              onLikeInsightCard={handleLikeInsightCard}
              onUnlikeLikedCard={handleUnlikeLikedCard}
              onOpenSettings={() => openSettings("model")}
              onOpenLikedCards={() => openSettings("likes")}
              onToggleTrace={() => setTraceOpen((current) => !current)}
              onActivateGraphConfig={(configId) => void handleActivateGraphFromChat(configId)}
              isTraceOpen={traceOpen}
              authUsername={authUsername}
              onLogout={onLogout}
              isAuthMutating={isAuthMutating}
            />
          </div>

          {traceOpen ? (
            <RunTracePanel
              activeConversationId={conversations.activeConversationId}
              activeConversationTitle={conversations.activeConversation?.title ?? null}
              onClose={() => setTraceOpen(false)}
            />
          ) : null}
        </div>
      </section>

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
