"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle, Plus, Send, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type RuntimeStatus = {
  configured: boolean;
  source: string | null;
  config_name: string | null;
  model: string | null;
};

type Message = {
  id: number | string;
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatAssistantProps = {
  className?: string;
  title: string;
  runtimeStatus?: RuntimeStatus | null;
  messages: Message[];
  input: string;
  error: string | null;
  isBootstrapping: boolean;
  isConversationLoading: boolean;
  isSending: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
};

export default function ChatAssistant({
  className,
  title,
  runtimeStatus,
  messages,
  input,
  error,
  isBootstrapping,
  isConversationLoading,
  isSending,
  onInputChange,
  onSend,
  onNewConversation,
  onOpenSettings,
}: ChatAssistantProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  const modelLabel = runtimeStatus?.configured
    ? `${runtimeStatus.config_name} · ${runtimeStatus.model}`
    : "尚未启用模型配置";

  return (
    <Card className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden border-slate-200 bg-white/92", className)}>
      <CardHeader className="border-b border-slate-200/80 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-xl font-semibold text-slate-950">{title}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{modelLabel}</p>
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
          ) : messages.length ? (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6",
                      message.role === "user"
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
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
