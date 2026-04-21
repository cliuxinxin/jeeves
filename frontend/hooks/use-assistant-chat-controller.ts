"use client";

import { useEffect, useMemo, useState } from "react";

import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";
import { useGraphConfigs } from "@/hooks/use-graph-configs";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";

export type AssistantChatMessage = {
  id: number | string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  node?: string;
  node_label?: string | null;
  state_patch?: Record<string, string>;
};

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

export function useAssistantChatController() {
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationActionNotice, setConversationActionNotice] = useState<string | null>(null);

  const runtimeStatusQuery = useRuntimeStatus();
  const conversations = useConversations();
  const graphConfigs = useGraphConfigs();
  const chatStream = useChatStream();

  useEffect(() => {
    chatStream.cancelStream();
    chatStream.clearError();
    setChatError(null);
    setConversationActionNotice(null);
  }, [conversations.activeConversationId]);

  const messages = useMemo<AssistantChatMessage[]>(
    () =>
      conversations.activeConversationMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at,
        node: message.node ?? undefined,
        node_label: message.node_label,
        state_patch: message.state_patch,
      })),
    [conversations.activeConversationMessages],
  );

  const activeGraphId =
    conversations.activeConversationDetail?.conversation.graph_config_id ??
    conversations.activeConversation?.graph_config_id ??
    graphConfigs.activeConfigId ??
    null;

  const isConfigured = Boolean(runtimeStatusQuery.data?.configured);
  const isBootstrapping = conversations.isBootstrapping || runtimeStatusQuery.isLoading;
  const combinedChatError = chatStream.error ?? chatError;

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatStream.isSending || !isConfigured || isBootstrapping) {
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

  return {
    input,
    setInput,
    chatError,
    setChatError,
    conversationActionNotice,
    runtimeStatusQuery,
    conversations,
    graphConfigs,
    chatStream,
    messages,
    activeGraphId,
    combinedChatError,
    isConfigured,
    isBootstrapping,
    handleSend,
    handleCreateConversation,
    handleDeleteConversation,
    handleActivateGraphFromChat,
  };
}
