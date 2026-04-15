"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAILogs } from "@/hooks/use-ai-logs";
import type { AILogStatus, GraphConfigRecord } from "@/lib/api/client";
import { formatNodeLabel } from "@/lib/node-ui";
import { cn } from "@/lib/utils";

type AILogsPanelProps = {
  activeConversationId: number | null;
  activeConversationTitle: string | null;
  graphConfigs: GraphConfigRecord[];
};

function statusBadgeClass(status: AILogStatus) {
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700";
  }
  return "bg-rose-50 text-rose-700";
}

export function AILogsPanel({
  activeConversationId,
  activeConversationTitle,
  graphConfigs,
}: AILogsPanelProps) {
  const [conversationIdInput, setConversationIdInput] = useState<string>("");
  const [requestIdInput, setRequestIdInput] = useState("");
  const [status, setStatus] = useState<AILogStatus | "">("");
  const [nodeName, setNodeName] = useState("");
  const [graphConfigId, setGraphConfigId] = useState<string>("");
  const [limit, setLimit] = useState("50");

  const filters = useMemo(
    () => ({
      conversationId: conversationIdInput ? Number(conversationIdInput) : undefined,
      requestId: requestIdInput,
      status,
      nodeName,
      graphConfigId: graphConfigId ? Number(graphConfigId) : undefined,
      limit: Number(limit) || 50,
    }),
    [conversationIdInput, graphConfigId, limit, nodeName, requestIdInput, status],
  );

  const logsQuery = useAILogs(filters, true);
  const logs = logsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-slate-950">AI 日志</h2>
        <p className="mt-1 text-sm text-slate-500">查看发给模型的完整消息、系统提示词、模型返回和错误信息，方便排查与优化。</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">会话 ID</label>
            <Input
              value={conversationIdInput}
              onChange={(event) => setConversationIdInput(event.target.value)}
              placeholder="例如 12"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">请求 ID</label>
            <Input
              value={requestIdInput}
              onChange={(event) => setRequestIdInput(event.target.value)}
              placeholder="例如 8b2f..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">工作流</label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              value={graphConfigId}
              onChange={(event) => setGraphConfigId(event.target.value)}
            >
              <option value="">全部工作流</option>
              {graphConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">节点</label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              value={nodeName}
              onChange={(event) => setNodeName(event.target.value)}
            >
              <option value="">全部节点</option>
              <option value="assistant">assistant</option>
              <option value="analyzer">analyzer</option>
              <option value="deconstructor">deconstructor</option>
              <option value="strategist">strategist</option>
              <option value="writer">writer</option>
              <option value="title_generator">title_generator</option>
              <option value="llm_test">llm_test</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">状态</label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              value={status}
              onChange={(event) => setStatus(event.target.value as AILogStatus | "")}
            >
              <option value="">全部状态</option>
              <option value="success">success</option>
              <option value="error">error</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">数量</label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="h-10 px-3" onClick={() => void logsQuery.refetch()}>
            {logsQuery.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新日志
          </Button>
          {activeConversationId !== null ? (
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-3"
              onClick={() => setConversationIdInput(String(activeConversationId))}
            >
              <Search className="h-4 w-4" />
              当前会话
            </Button>
          ) : null}
          {activeConversationId !== null && activeConversationTitle ? (
            <div className="text-sm text-slate-500">
              当前会话: <span className="font-medium text-slate-700">{activeConversationTitle}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">日志结果</div>
          <div className="mt-1 text-xs text-slate-500">按时间倒序展示，展开后可直接看到发给 AI 的完整上下文和返回内容。</div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 pr-3 [scrollbar-color:rgba(148,163,184,0.75)_transparent] [scrollbar-width:thin]">
          <div className="space-y-4">
            {logsQuery.isLoading ? (
              <div className="flex min-h-[12rem] items-center justify-center text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  正在加载日志...
                </span>
              </div>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <details key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", statusBadgeClass(log.status))}>
                            {log.status}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            {formatNodeLabel(log.node_name, log.node_label)}
                          </span>
                          {log.graph_config_name ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                              {log.graph_config_name}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm font-semibold text-slate-950">
                          {log.conversation_title || "未关联会话"} · {log.model || "未知模型"}
                        </div>
                        <div className="text-xs text-slate-500">
                          request_id: {log.request_id || "无"} · 会话 ID: {log.conversation_id ?? "无"} · 用时 {log.duration_ms}ms · 尝试 {log.attempt_count} 次
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{log.created_at}</div>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">发给 AI 的内容</div>
                      <div className="space-y-3">
                        {(log.input_messages ?? []).map((message, index) => (
                          <div key={`${log.id}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                      <div className="text-sm font-semibold text-slate-900">AI 返回</div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
                          {log.response_text || "(无返回内容)"}
                        </pre>
                      </div>
                    </div>

                    {log.error_message ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-rose-700">错误信息</div>
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                          <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-rose-700">
                            {log.error_message}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
                当前筛选条件下还没有日志。先发一条消息，或者放宽筛选条件再试。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
