"use client";

import { useEffect, useMemo, useState } from "react";

import { ChatPane, type ChatPaneMessage } from "@/components/chat-pane";
import { ConversationSidebar } from "@/components/conversation-sidebar";
import { RunTracePanel } from "@/components/run-trace-panel";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";
import { useGraphConfigs } from "@/hooks/use-graph-configs";
import { useLLMConfigs } from "@/hooks/use-llm-configs";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";

type SettingsSection = "model" | "graph" | "logs";

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
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("model");
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationActionNotice, setConversationActionNotice] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const runtimeStatusQuery = useRuntimeStatus();
  const conversations = useConversations();
  const llmConfigs = useLLMConfigs();
  const graphConfigs = useGraphConfigs();
  const chatStream = useChatStream();

  useEffect(() => {
    chatStream.cancelStream();
    chatStream.clearError();
    setChatError(null);
    setConversationActionNotice(null);
  }, [conversations.activeConversationId]);

  const messages = useMemo<ChatPaneMessage[]>(
    () =>
      conversations.activeConversationMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at,
        node: "node" in message ? (message as ChatPaneMessage).node : undefined,
        node_label: "node_label" in message ? (message as ChatPaneMessage).node_label : undefined,
        state_patch: "state_patch" in message ? (message as ChatPaneMessage).state_patch : undefined,
      })),
    [conversations.activeConversationMessages],
  );

  const combinedChatError = chatStream.error ?? chatError;
  const activeGraphId =
    conversations.activeConversationDetail?.conversation.graph_config_id ??
    conversations.activeConversation?.graph_config_id ??
    graphConfigs.activeConfigId;

  function describeError(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  function formatCreateConversationNotice(errorMessage: string) {
    const normalized = errorMessage.trim();
    if (!normalized || normalized === "创建对话失败。") {
      return "没能创建新对话，当前仍停留在这个会话。";
    }
    return `没能创建新对话，当前仍停留在这个会话。原因：${normalized}`;
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatStream.isSending || !runtimeStatusQuery.data?.configured) {
      return;
    }

    setChatError(null);
    setConversationActionNotice(null);
    chatStream.clearError();

    let conversationId = conversations.activeConversationId;
    if (conversationId === null) {
      try {
        const createdConversation = await conversations.createNewConversation({
          graph_config_id: activeGraphId ?? undefined,
        });
        conversationId = createdConversation.id;
      } catch (error) {
        setChatError(describeError(error, "创建对话失败。"));
        return;
      }
    }

    setInput("");

    await chatStream.sendMessage({
      conversation_id: conversationId,
      message: trimmed,
    });
  }

  async function handleCreateConversation() {
    try {
      setChatError(null);
      setConversationActionNotice(null);
      chatStream.clearError();
      const createdConversation = await conversations.createNewConversation({
        graph_config_id: activeGraphId ?? undefined,
      });
      conversations.setActiveConversationId(createdConversation.id);
    } catch (error) {
      const message = describeError(error, "创建对话失败。");
      if (conversations.activeConversationId !== null) {
        setConversationActionNotice(formatCreateConversationNotice(message));
        return;
      }
      setChatError(message);
    }
  }

  async function handleDeleteConversation(conversationId: number) {
    try {
      chatStream.clearError();
      await conversations.removeConversation(conversationId);
      setChatError(null);
      setConversationActionNotice(null);
    } catch (error) {
      setChatError(describeError(error, "删除对话失败。"));
    }
  }

  async function handleActivateGraphFromChat(configId: number) {
    try {
      setConversationActionNotice(null);
      chatStream.clearError();
      if (conversations.activeConversationId === null) {
        const createdConversation = await conversations.createNewConversation({
          graph_config_id: configId,
        });
        conversations.setActiveConversationId(createdConversation.id);
      } else {
        await conversations.updateConversationConfig(conversations.activeConversationId, configId);
      }
      setChatError(null);
    } catch (error) {
      setChatError(describeError(error, "切换工作流失败。"));
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
              runtimeStatus={runtimeStatusQuery.data ?? null}
              graphConfigs={graphConfigs.configs}
              activeGraphId={activeGraphId}
              messages={messages}
              streamingMessages={chatStream.streamingMessages}
              notice={conversationActionNotice}
              input={input}
              error={combinedChatError}
              isBootstrapping={conversations.isBootstrapping || runtimeStatusQuery.isLoading}
              isConversationLoading={conversations.isConversationLoading}
              isSending={chatStream.isSending}
              onInputChange={setInput}
              onSend={() => void handleSend()}
              onNewConversation={() => void handleCreateConversation()}
              onOpenSettings={() => openSettings("model")}
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
