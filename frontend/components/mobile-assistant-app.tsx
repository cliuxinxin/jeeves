"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";
import { useGraphConfigs } from "@/hooks/use-graph-configs";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";
import { cn } from "@/lib/utils";
import { formatNodeLabel } from "@/lib/node-ui";

type MobileAssistantAppProps = {
  authUsername?: string | null;
  onLogout?: () => void;
  isAuthMutating?: boolean;
};

type MobileMessage = {
  id: number | string;
  role: "user" | "assistant" | "system";
  content: string;
  node?: string;
  node_label?: string | null;
};

const quickPrompts = [
  "帮我梳理今天最重要的想法",
  "把这段内容提炼成 3 张洞察卡片",
  "给我一个适合发朋友圈的表达版本",
];

const markdownComponents: Components = {
  p: ({ children, ...props }) => (
    <p className="my-2.5 leading-7 text-slate-700" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-3 list-disc space-y-2 pl-5 text-slate-700 marker:text-slate-400" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-3 list-decimal space-y-2 pl-5 text-slate-700 marker:text-slate-400" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-1 leading-7" {...props}>
      {children}
    </li>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="mb-3 mt-1 text-xl font-semibold tracking-tight text-slate-950" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-3 mt-5 text-lg font-semibold tracking-tight text-slate-950 first:mt-1" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-2 mt-4 text-base font-semibold text-slate-950 first:mt-1" {...props}>
      {children}
    </h3>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-4 border-l-4 border-amber-300 pl-4 text-slate-600" {...props}>
      {children}
    </blockquote>
  ),
  code: ({ children, className, ...props }) => {
    if (className) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-900" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="my-4 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 text-[13px] leading-6 text-slate-50"
      {...props}
    >
      {children}
    </pre>
  ),
};

function describeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/(^|\n)[·•●▪◦]\s+/g, "$1- ")
    .replace(/(^|\n)-(?=\S)/g, "$1- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function MobileMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {normalizeMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}

export function MobileAssistantApp({
  authUsername,
  onLogout,
  isAuthMutating,
}: MobileAssistantAppProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
  }, [conversations.activeConversationId]);

  const persistedMessages = useMemo<MobileMessage[]>(
    () =>
      conversations.activeConversationMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        node: "node" in message ? (message as MobileMessage).node : undefined,
        node_label: "node_label" in message ? (message as MobileMessage).node_label : undefined,
      })),
    [conversations.activeConversationMessages],
  );

  const displayMessages = useMemo<MobileMessage[]>(
    () => [...persistedMessages, ...chatStream.streamingMessages],
    [persistedMessages, chatStream.streamingMessages],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [displayMessages, chatStream.isSending]);

  const activeGraphId =
    conversations.activeConversationDetail?.conversation.graph_config_id ??
    conversations.activeConversation?.graph_config_id ??
    graphConfigs.activeConfigId ??
    null;

  const combinedChatError = chatStream.error ?? chatError;
  const isBootstrapping = conversations.isBootstrapping || runtimeStatusQuery.isLoading;
  const isReady = Boolean(runtimeStatusQuery.data?.configured);
  const activeTitle = conversations.activeConversation?.title ?? "新对话";
  const modelLabel = runtimeStatusQuery.data?.configured
    ? `${runtimeStatusQuery.data.config_name} · ${runtimeStatusQuery.data.model}`
    : "还没有可用模型配置";

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatStream.isSending || !isReady) {
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
      setMenuOpen(false);
    } catch (error) {
      setChatError(describeError(error, "创建对话失败。"));
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

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
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
            className="flex h-full w-[86vw] max-w-sm flex-col bg-white/96 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-xl font-semibold">Jeeves Mobile</div>
                <div className="mt-1 text-xs text-slate-500">选择历史对话</div>
              </div>
              <Button type="button" size="icon" variant="secondary" onClick={() => setMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Button type="button" className="mb-4 w-full" onClick={() => void handleCreateConversation()}>
              <Plus className="h-4 w-4" />
              新建手机对话
            </Button>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 pr-2">
                {conversations.conversations.length > 0 ? (
                  conversations.conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      className={cn(
                        "w-full rounded-3xl border px-4 py-3 text-left transition",
                        conversation.id === conversations.activeConversationId
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
                      )}
                      onClick={() => {
                        void conversations.selectConversation(conversation.id);
                        setMenuOpen(false);
                      }}
                    >
                      <div className="truncate text-sm font-semibold">{conversation.title}</div>
                      <div
                        className={cn(
                          "mt-1 line-clamp-2 text-xs leading-5",
                          conversation.id === conversations.activeConversationId ? "text-slate-300" : "text-slate-500",
                        )}
                      >
                        {conversation.preview || "暂无消息"}
                      </div>
                    </button>
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

      <main className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
        <header className="shrink-0 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="rounded-[2rem] border border-white/70 bg-white/72 p-3 shadow-[0_18px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <Button type="button" size="icon" variant="secondary" onClick={() => setMenuOpen(true)}>
                <Menu className="h-4 w-4" />
              </Button>

              <div className="min-w-0 flex-1 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                  Mobile App
                </div>
                <h1 className="mt-1 truncate font-display text-lg font-semibold text-slate-950">{activeTitle}</h1>
              </div>

              {authUsername && onLogout ? (
                <Button type="button" size="icon" variant="secondary" onClick={onLogout} disabled={isAuthMutating}>
                  {isAuthMutating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </Button>
              ) : (
                <div className="h-11 w-11" />
              )}
            </div>

            <div className="mt-3 grid gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-950/5 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span className="truncate">{modelLabel}</span>
              </div>

              <label className="flex items-center gap-2 rounded-2xl bg-white/75 px-3 py-2">
                <span className="shrink-0 text-slate-500">工作流</span>
                <select
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none"
                  value={activeGraphId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      void handleActivateGraphFromChat(Number(event.target.value));
                    }
                  }}
                  disabled={graphConfigs.configs.length === 0}
                >
                  <option value="" disabled>
                    暂无工作流
                  </option>
                  {graphConfigs.configs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1 px-4 py-3" viewportRef={viewportRef}>
          {conversationActionNotice ? (
            <div className="mb-3 rounded-3xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-800">
              {conversationActionNotice}
            </div>
          ) : null}

          {isBootstrapping || conversations.isConversationLoading ? (
            <div className="flex h-full min-h-[18rem] items-center justify-center text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 shadow-sm">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                正在加载对话...
              </span>
            </div>
          ) : displayMessages.length > 0 ? (
            <div className="space-y-4 pb-3">
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <article
                    className={cn(
                      "max-w-[92%] rounded-[1.65rem] px-4 py-3 text-sm leading-6 shadow-[0_14px_34px_rgba(15,23,42,0.08)]",
                      message.role === "user"
                        ? "bg-slate-950 text-white"
                        : "border border-white/70 bg-white/88 text-slate-700 backdrop-blur",
                    )}
                  >
                    {message.role === "assistant" && message.node ? (
                      <div className="mb-2 inline-flex rounded-full bg-amber-100/80 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                        {formatNodeLabel(message.node, message.node_label)}
                      </div>
                    ) : null}

                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <MobileMarkdown content={message.content} />
                    )}
                  </article>
                </div>
              ))}

              {chatStream.isSending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    正在生成...
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[22rem] items-center justify-center">
              <div className="w-full rounded-[2rem] border border-white/70 bg-white/72 p-5 text-center shadow-[0_18px_44px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-semibold text-slate-950">手机上也能随手聊</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  这个入口专门给手机浏览器使用，适合碎片时间记录想法、生成卡片和继续历史对话。
                </p>
                <div className="mt-5 grid gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-amber-300 hover:text-slate-950"
                      onClick={() => setInput(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3">
          {combinedChatError ? (
            <div className="mb-3 rounded-3xl border border-rose-200 bg-rose-50/95 px-4 py-3 text-sm text-rose-700">
              {combinedChatError}
            </div>
          ) : null}

          {!isReady ? (
            <div className="mb-3 rounded-3xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm leading-6 text-amber-800">
              还没有可用模型配置。请先进入 <a className="font-semibold underline" href="/">桌面工作台</a> 完成设置。
            </div>
          ) : null}

          <form
            className="flex items-end gap-2 rounded-[1.75rem] border border-white/70 bg-white/85 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="输入你的问题..."
              rows={1}
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-base leading-6 text-slate-950 outline-none placeholder:text-slate-400"
            />
            <Button
              type="submit"
              size="icon"
              disabled={chatStream.isSending || !input.trim() || !isReady}
              className="shrink-0 rounded-2xl"
            >
              {chatStream.isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </footer>
      </main>
    </div>
  );
}
