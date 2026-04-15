"use client";

import { useMemo } from "react";
import { LoaderCircle, PanelRightClose, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAILogs } from "@/hooks/use-ai-logs";
import type { AILogRecord } from "@/lib/api/client";
import { formatNodeLabel } from "@/lib/node-ui";
import { cn } from "@/lib/utils";

type RequestTraceGroup = {
  requestId: string;
  createdAt: string;
  hasError: boolean;
  graphConfigName: string | null;
  model: string | null;
  items: AILogRecord[];
};

type RunTracePanelProps = {
  activeConversationId: number | null;
  activeConversationTitle: string | null;
  onClose: () => void;
};

function requestStatusClass(hasError: boolean) {
  return hasError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";
}

function shortenRequestId(requestId: string) {
  if (requestId.length <= 16) {
    return requestId;
  }
  return `${requestId.slice(0, 8)}...${requestId.slice(-4)}`;
}

function buildRequestGroups(logs: AILogRecord[]): RequestTraceGroup[] {
  const groups = new Map<string, RequestTraceGroup>();

  for (const log of logs) {
    const requestId = log.request_id || `log-${log.id}`;
    const existing = groups.get(requestId);
    if (!existing) {
      groups.set(requestId, {
        requestId,
        createdAt: log.created_at,
        hasError: log.status === "error" || Boolean(log.error_message),
        graphConfigName: log.graph_config_name ?? null,
        model: log.model ?? null,
        items: [log],
      });
      continue;
    }

    existing.items.push(log);
    existing.hasError ||= log.status === "error" || Boolean(log.error_message);
    if (new Date(log.created_at).getTime() > new Date(existing.createdAt).getTime()) {
      existing.createdAt = log.created_at;
    }
    existing.graphConfigName ||= log.graph_config_name ?? null;
    existing.model ||= log.model ?? null;
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => left.id - right.id),
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function RunTracePanel({
  activeConversationId,
  activeConversationTitle,
  onClose,
}: RunTracePanelProps) {
  const logsQuery = useAILogs(
    {
      conversationId: activeConversationId ?? undefined,
      limit: 120,
    },
    activeConversationId !== null,
  );
  const requestGroups = useMemo(
    () => buildRequestGroups(logsQuery.data?.items ?? []),
    [logsQuery.data?.items],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/92 xl:w-[26rem]">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-lg font-semibold text-slate-950">运行轨迹</div>
            <div className="mt-1 text-sm leading-6 text-slate-500">
              按 request 分组查看每个 node 实际发出的 prompt、输入消息、返回内容和错误。
            </div>
            {activeConversationTitle ? (
              <div className="mt-2 text-xs text-slate-500">
                当前会话: <span className="font-medium text-slate-700">{activeConversationTitle}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => void logsQuery.refetch()}
              disabled={activeConversationId === null}
            >
              {logsQuery.isFetching ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button type="button" variant="secondary" size="icon" onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-4 py-4">
        {activeConversationId === null ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm leading-6 text-slate-500">
            先创建或进入一个会话，这里才会显示该会话的 node 运行轨迹。
          </div>
        ) : logsQuery.isLoading ? (
          <div className="flex min-h-[14rem] items-center justify-center text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在加载运行轨迹...
            </span>
          </div>
        ) : requestGroups.length > 0 ? (
          <div className="space-y-4 pb-2">
            {requestGroups.map((group, index) => (
              <details
                key={group.requestId}
                open={index === 0}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            requestStatusClass(group.hasError),
                          )}
                        >
                          {group.hasError ? "error" : "success"}
                        </span>
                        {group.graphConfigName ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            {group.graphConfigName}
                          </span>
                        ) : null}
                        {group.model ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            {group.model}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm font-semibold text-slate-950">
                        Request {shortenRequestId(group.requestId)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {group.items.length} 个 node · 会话 ID {activeConversationId}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{group.createdAt}</div>
                  </div>
                </summary>

                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                  {group.items.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">
                            {formatNodeLabel(log.node_name, log.node_label)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            尝试 {log.attempt_count} 次 · 用时 {log.duration_ms}ms · source {log.llm_source || "unknown"}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            requestStatusClass(log.status === "error" || Boolean(log.error_message)),
                          )}
                        >
                          {log.status}
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Input Messages
                          </div>
                          <div className="space-y-3">
                            {(log.input_messages ?? []).map((message, messageIndex) => (
                              <div
                                key={`${log.id}-${messageIndex}`}
                                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                              >
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  {message.role}
                                </div>
                                <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
                                  {message.content || "(空内容)"}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Response
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
                              {log.response_text || "(无返回内容)"}
                            </pre>
                          </div>
                        </div>

                        {log.error_message ? (
                          <div className="space-y-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                              Error
                            </div>
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                              <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-rose-700">
                                {log.error_message}
                              </pre>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm leading-6 text-slate-500">
            当前会话还没有 AI 运行轨迹。发一条消息后，这里会按 request 展开每个 node 的完整输入输出。
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
