"use client";

import { useEffect, useMemo, useState } from "react";

import { ChatPane, type ChatPaneMessage } from "@/components/chat-pane";
import { ConversationSidebar } from "@/components/conversation-sidebar";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";
import { useGraphConfigs } from "@/hooks/use-graph-configs";
import { useLLMConfigs } from "@/hooks/use-llm-configs";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";

type SettingsSection = "model" | "graph";

export default function AssistantWorkspace() {
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("model");
  const [chatError, setChatError] = useState<string | null>(null);

  const runtimeStatusQuery = useRuntimeStatus();
  const conversations = useConversations();
  const llmConfigs = useLLMConfigs();
  const graphConfigs = useGraphConfigs();
  const chatStream = useChatStream();

  useEffect(() => {
    chatStream.cancelStream();
    chatStream.clearError();
  }, [conversations.activeConversationId]);

  const messages = useMemo<ChatPaneMessage[]>(
    () =>
      conversations.activeConversationMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at,
        node: "node" in message ? (message as ChatPaneMessage).node : undefined,
      })),
    [conversations.activeConversationMessages],
  );

  const combinedChatError = chatStream.error ?? chatError;
  const activeGraphId = graphConfigs.activeConfigId;

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatStream.isSending || !runtimeStatusQuery.data?.configured) {
      return;
    }

    setChatError(null);
    chatStream.clearError();

    let conversationId = conversations.activeConversationId;
    if (conversationId === null) {
      try {
        const createdConversation = await conversations.createNewConversation();
        conversationId = createdConversation.id;
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "创建对话失败。");
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
      const createdConversation = await conversations.createNewConversation();
      conversations.setActiveConversationId(createdConversation.id);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "创建对话失败。");
    }
  }

  async function handleDeleteConversation(conversationId: number) {
    try {
      await conversations.removeConversation(conversationId);
      setChatError(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "删除对话失败。");
    }
  }

  async function handleActivateGraphFromChat(configId: number) {
    try {
      await graphConfigs.activateConfig(configId);
      setChatError(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "切换工作流失败。");
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
        <ChatPane
          title={conversations.activeConversation?.title ?? "New chat"}
          runtimeStatus={runtimeStatusQuery.data ?? null}
          graphConfigs={graphConfigs.configs}
          activeGraphId={activeGraphId}
          messages={messages}
          streamingMessages={chatStream.streamingMessages}
          input={input}
          error={combinedChatError}
          isBootstrapping={conversations.isBootstrapping || runtimeStatusQuery.isLoading}
          isConversationLoading={conversations.isConversationLoading}
          isSending={chatStream.isSending}
          onInputChange={setInput}
          onSend={() => void handleSend()}
          onNewConversation={() => void handleCreateConversation()}
          onOpenSettings={() => openSettings("model")}
          onActivateGraphConfig={(configId) => void handleActivateGraphFromChat(configId)}
        />
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
