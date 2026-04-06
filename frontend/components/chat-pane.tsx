"use client";

import { useEffect, useMemo, useRef } from "react";
import { LoaderCircle, Plus, Send, Settings2 } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GraphConfigRecord, HealthResponse } from "@/lib/api/client";
import type { StreamedAssistantMessage } from "@/hooks/use-chat-stream";
import { cn } from "@/lib/utils";

export type ChatPaneMessage = {
  id: number | string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  node?: string;
};

type ChatPaneProps = {
  title: string;
  runtimeStatus: HealthResponse | null;
  graphConfigs: GraphConfigRecord[];
  activeGraphId: number | null;
  messages: ChatPaneMessage[];
  streamingMessages: StreamedAssistantMessage[];
  input: string;
  error: string | null;
  isBootstrapping: boolean;
  isConversationLoading: boolean;
  isSending: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onActivateGraphConfig: (configId: number) => void;
};

function formatStageLabel(node?: string) {
  if (!node) return null;
  if (node === "analyzer") return "阶段 1 · 初步分析";
  if (node === "deconstructor") return "阶段 2 · 拆解分析";
  return `阶段 · ${node}`;
}

function stageAccentClass(node?: string) {
  if (node === "analyzer") return "border-l-sky-400 bg-sky-50/60";
  if (node === "deconstructor") return "border-l-emerald-400 bg-emerald-50/50";
  return "border-l-slate-300 bg-white";
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/(^|\n)[·•●▪◦]\s+/g, "$1- ")
    .replace(/(^|\n)-(?=\S)/g, "$1- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="mb-4 mt-2 font-display text-xl font-semibold tracking-tight text-slate-950" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mb-3 mt-6 font-display text-lg font-semibold tracking-tight text-slate-950 first:mt-2"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-2 mt-5 text-[15px] font-semibold text-slate-900 first:mt-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="my-3 leading-7 text-slate-700" {...props}>
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
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-4 border-l-4 border-slate-200 pl-4 italic text-slate-600" {...props}>
      {children}
    </blockquote>
  ),
  pre: ({ children, ...props }) => (
    <pre
      className="my-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950/95 px-4 py-3 text-[13px] leading-6 text-slate-50"
      {...props}
    >
      {children}
    </pre>
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
  hr: (props) => <hr className="my-5 border-slate-200" {...props} />,
};

export function ChatPane({
  title,
  runtimeStatus,
  graphConfigs,
  activeGraphId,
  messages,
  streamingMessages,
  input,
  error,
  isBootstrapping,
  isConversationLoading,
  isSending,
  onInputChange,
  onSend,
  onNewConversation,
  onOpenSettings,
  onActivateGraphConfig,
}: ChatPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  const displayMessages = useMemo(
    () => [...messages, ...streamingMessages],
    [messages, streamingMessages],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [displayMessages, isSending]);

  const modelLabel = runtimeStatus?.configured
    ? `${runtimeStatus.config_name} · ${runtimeStatus.model}`
    : "尚未启用模型配置";

  return (
    <Card className="flex h-full min-h-0 w-full flex-col overflow-hidden border-slate-200 bg-white/92">
      <CardHeader className="border-b border-slate-200/80 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-xl font-semibold text-slate-950">{title}</CardTitle>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-sm text-slate-500">{modelLabel}</span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">工作流:</span>
                <select
                  className="max-w-[150px] cursor-pointer truncate border-b border-dashed border-slate-300 bg-transparent pb-0.5 text-sm font-medium text-slate-700 focus:outline-none"
                  value={activeGraphId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      onActivateGraphConfig(Number(event.target.value));
                    }
                  }}
                  disabled={graphConfigs.length === 0}
                >
                  <option value="" disabled>
                    -- 暂无工作流 --
                  </option>
                  {graphConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" className="h-10 px-3" onClick={onNewConversation}>
              <Plus className="h-4 w-4" />
              新对话
            </Button>
            <Button type="button" variant="secondary" size="icon" onClick={onOpenSettings}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full px-5 py-5 sm:px-6" viewportRef={viewportRef}>
          {isBootstrapping || isConversationLoading ? (
            <div className="flex h-full min-h-[18rem] items-center justify-center text-sm text-slate-500">
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                正在加载对话...
              </span>
            </div>
          ) : displayMessages.length > 0 ? (
            <div className="space-y-4">
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6",
                      message.role === "user"
                        ? "max-h-96 overflow-y-auto bg-slate-950 text-white"
                        : cn(
                            "border border-slate-200 text-slate-700",
                            message.node ? "border-l-4" : null,
                            message.node ? stageAccentClass(message.node) : "bg-slate-50",
                            message.node === "analyzer" ? "py-2" : null,
                          ),
                    )}
                  >
                    {message.role === "assistant" ? (
                      <div
                        className={cn(
                          "prose prose-sm max-w-none text-slate-700",
                          "prose-headings:font-inherit prose-headings:text-inherit",
                          "prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0",
                          "prose-code:before:content-none prose-code:after:content-none",
                        )}
                      >
                        {message.node ? (
                          <div className="not-prose mb-2 flex items-center justify-between gap-3">
                            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur">
                              {formatStageLabel(message.node)}
                            </div>
                          </div>
                        ) : null}
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                          {normalizeMarkdown(message.content)}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {isSending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    正在生成回复...
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-[18rem] items-center justify-center">
              <div className="max-w-md text-center">
                <div className="font-display text-2xl font-semibold text-slate-950">开始一个新对话</div>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  历史会自动保存在 SQLite。配置模型后，这里会使用 SSE 流式返回回复。
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="flex-col gap-3 border-t border-slate-200/80 pt-4">
        {error ? (
          <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!runtimeStatus?.configured ? (
          <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            还没有可用模型配置，请点击右上角设置。
          </div>
        ) : null}

        <div className="grid w-full gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="输入你的问题"
          />

          <Button size="icon" onClick={onSend} disabled={isSending || !input.trim() || !runtimeStatus?.configured}>
            {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
