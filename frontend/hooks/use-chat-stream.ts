"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { API_URL } from "@/lib/api";
import type {
  ChatStreamRequest,
  ConversationDetailResponse,
  ConversationMessageRecord,
  ConversationRecord,
} from "@/lib/api/client";

import { queryKeys } from "./query-keys";

export type StreamedAssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  node?: string;
  node_label?: string | null;
  state_patch?: Record<string, string>;
};

type FinalAssistantMessage = ConversationMessageRecord & {
  node?: string;
};

type UserMessageEvent = {
  message: ConversationMessageRecord;
  conversation: ConversationRecord;
};

type DoneEvent = {
  messages: FinalAssistantMessage[];
  conversation: ConversationRecord;
};

type NodeStateEvent = {
  node_run: {
    node: string;
    node_label: string;
    output: string;
    state_patch: Record<string, string>;
  };
};

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

  if (dataLines.length === 0) {
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

export function useChatStream() {
  const queryClient = useQueryClient();
  const controllerRef = useRef<AbortController | null>(null);
  const [streamingMessages, setStreamingMessages] = useState<StreamedAssistantMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancelStream() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreamingMessages([]);
    setIsSending(false);
  }

  useEffect(() => cancelStream, []);

  function appendUserMessageToCache(payload: UserMessageEvent) {
    queryClient.setQueryData<ConversationDetailResponse>(
      queryKeys.conversation(payload.conversation.id),
      (current) => {
        const messages = current?.messages ?? [];
        const alreadyExists = messages.some((message) => message.id === payload.message.id);
        return {
          conversation: payload.conversation,
          messages: alreadyExists ? messages : [...messages, payload.message],
        };
      },
    );
  }

  function appendAssistantMessagesToCache(payload: DoneEvent) {
    queryClient.setQueryData<ConversationDetailResponse>(
      queryKeys.conversation(payload.conversation.id),
      (current) => {
        const existingMessages = current?.messages ?? [];
        const nextMessages = [
          ...existingMessages.filter(
            (message) => !payload.messages.some((finalMessage) => finalMessage.id === message.id),
          ),
          ...payload.messages,
        ];

        return {
          conversation: payload.conversation,
          messages: nextMessages,
        };
      },
    );
  }

  async function sendMessage(payload: ChatStreamRequest) {
    cancelStream();
    setError(null);
    setIsSending(true);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const failurePayload = await response.json().catch(() => null);
        throw new Error(failurePayload?.detail || "流式请求失败。");
      }

      if (!response.body) {
        throw new Error("浏览器不支持流式响应。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        while (buffer.includes("\n\n")) {
          const separatorIndex = buffer.indexOf("\n\n");
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const parsed = parseSSEEvent(block);
          if (!parsed) {
            continue;
          }

          if (parsed.event === "user_message") {
            appendUserMessageToCache(parsed.data as unknown as UserMessageEvent);
            continue;
          }

          if (parsed.event === "chunk") {
            const node = typeof parsed.data.node === "string" ? parsed.data.node : "assistant";
            const text = typeof parsed.data.text === "string" ? parsed.data.text : "";
            if (!text) {
              continue;
            }

            setStreamingMessages((current) => {
              const existing = current.find((message) => message.id === node);
              if (existing) {
                return current.map((message) =>
                  message.id === node ? { ...message, content: message.content + text } : message,
                );
              }
              return [...current, { id: node, role: "assistant", content: text, node }];
            });
            continue;
          }

          if (parsed.event === "node_state") {
            const { node_run } = parsed.data as unknown as NodeStateEvent;
            if (!node_run?.node) {
              continue;
            }

            setStreamingMessages((current) => {
              const existing = current.find((message) => message.id === node_run.node);
              if (!existing) {
                return [
                  ...current,
                  {
                    id: node_run.node,
                    role: "assistant",
                    content: node_run.output || "",
                    node: node_run.node,
                    node_label: node_run.node_label,
                    state_patch: node_run.state_patch ?? {},
                  },
                ];
              }

              return current.map((message) =>
                message.id === node_run.node
                  ? {
                      ...message,
                      content: node_run.output || message.content,
                      node_label: node_run.node_label,
                      state_patch: node_run.state_patch ?? {},
                    }
                  : message,
              );
            });
            continue;
          }

          if (parsed.event === "done") {
            const doneEvent = parsed.data as unknown as DoneEvent;
            appendAssistantMessagesToCache(doneEvent);
            setStreamingMessages([]);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
              queryClient.invalidateQueries({ queryKey: ["ai-logs"] }),
            ]);
            break;
          }

          if (parsed.event === "error") {
            throw new Error(
              typeof parsed.data.message === "string" ? parsed.data.message : "流式请求失败。",
            );
          }
        }
      }
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        return;
      }
      setError(streamError instanceof Error ? streamError.message : "发送消息失败。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conversation(payload.conversation_id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
        queryClient.invalidateQueries({ queryKey: ["ai-logs"] }),
      ]);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      setIsSending(false);
    }
  }

  return {
    streamingMessages,
    isSending,
    error,
    sendMessage,
    cancelStream,
    clearError: () => setError(null),
  };
}
