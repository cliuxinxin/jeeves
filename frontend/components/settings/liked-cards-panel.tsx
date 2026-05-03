"use client";

import { useMemo, useState } from "react";
import { Download, Heart, LoaderCircle, Search, Trash, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLikedCards } from "@/hooks/use-liked-cards";
import type { LikedCardRecord } from "@/lib/api/client";
import { formatNodeLabel } from "@/lib/node-ui";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function summarizeText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getGenerationLogs(snapshot: unknown): JsonRecord[] {
  const generation = asRecord(asRecord(snapshot).generation);
  return asArray(generation.logs).map(asRecord);
}

function getPromptPreviews(snapshot: unknown): JsonRecord[] {
  const graphConfig = asRecord(asRecord(snapshot).graph_config);
  return asArray(graphConfig.prompt_previews).map(asRecord);
}

function safeFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile({
  content,
  filename,
  type,
}: {
  content: string;
  filename: string;
  type: string;
}) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildExportPayload(cards: LikedCardRecord[]) {
  return {
    exported_at: new Date().toISOString(),
    total: cards.length,
    items: cards.map((card) => ({
      id: card.id,
      title: card.title,
      content: card.content,
      route_label: card.route_label,
      card_index: card.card_index,
      created_at: card.created_at,
      conversation: {
        id: card.conversation_id,
        title: card.conversation_title,
      },
      workflow: {
        graph_config_id: card.graph_config_id,
        graph_config_name: card.graph_config_name,
        graph_type: card.graph_type,
      },
      source: {
        message_id: card.source_message_id,
        request_id: card.source_request_id,
        node_name: card.source_node_name,
        node_label: card.source_node_label,
        state_patch: card.source_state_patch ?? {},
      },
      workflow_snapshot: card.workflow_snapshot ?? {},
    })),
  };
}

function formatCardAsMarkdown(card: LikedCardRecord, index: number) {
  const generationLogs = getGenerationLogs(card.workflow_snapshot);
  const promptPreviews = getPromptPreviews(card.workflow_snapshot);
  const sourceStateEntries = Object.entries(card.source_state_patch ?? {});
  const lines = [
    `## ${index + 1}. ${card.title}`,
    "",
    `- 会话: ${card.conversation_title || `会话 ${card.conversation_id}`}`,
    `- 卡片: ${card.card_index}`,
    `- 路由: ${card.route_label || "未记录"}`,
    `- 工作流: ${card.graph_config_name || card.graph_type || "未记录"}`,
    `- 源节点: ${formatNodeLabel(card.source_node_name, card.source_node_label)}`,
    `- Request: ${card.source_request_id || "未匹配到同次生成日志"}`,
    `- 点赞时间: ${card.created_at}`,
    "",
    "### 卡片内容",
    "",
    card.content,
    "",
  ];

  if (sourceStateEntries.length > 0) {
    lines.push("### 节点状态补丁", "");
    for (const [key, value] of sourceStateEntries) {
      lines.push(`#### ${key}`, "", "```json", displayValue(value), "```", "");
    }
  }

  if (generationLogs.length > 0) {
    lines.push("### 同次生成的节点日志", "");
    for (const [logIndex, log] of generationLogs.entries()) {
      const nodeName = asString(log.node_name);
      const nodeLabel = asString(log.node_label);
      const inputMessages = asArray(log.input_messages).map(asRecord);
      const responseText = asString(log.response_text);
      lines.push(`#### ${logIndex + 1}. ${formatNodeLabel(nodeName, nodeLabel)}`, "");

      if (inputMessages.length > 0) {
        lines.push("输入消息 / Prompt:", "");
        for (const message of inputMessages) {
          lines.push(`**${asString(message.role) || "message"}**`, "", asString(message.content) || "", "");
        }
      }

      if (responseText) {
        lines.push("节点输出:", "", responseText, "");
      }
    }
  }

  if (promptPreviews.length > 0) {
    lines.push("### 工作流提示词预览", "");
    for (const preview of promptPreviews) {
      lines.push(
        `#### ${formatNodeLabel(asString(preview.node), asString(preview.node_label))}`,
        "",
        asString(preview.prompt_preview) || "",
        "",
      );
    }
  }

  return lines.join("\n").trim();
}

function exportLikedCards(cards: LikedCardRecord[], format: "json" | "markdown") {
  if (cards.length === 0) {
    return;
  }

  const timestamp = safeFileTimestamp();
  if (format === "json") {
    downloadTextFile({
      content: JSON.stringify(buildExportPayload(cards), null, 2),
      filename: `liked-cards-${timestamp}.json`,
      type: "application/json;charset=utf-8",
    });
    return;
  }

  downloadTextFile({
    content: [
      "# Jeeves 好卡片导出",
      "",
      `导出时间: ${new Date().toLocaleString()}`,
      `卡片数量: ${cards.length}`,
      "",
      ...cards.map(formatCardAsMarkdown),
    ].join("\n\n---\n\n"),
    filename: `liked-cards-${timestamp}.md`,
    type: "text/markdown;charset=utf-8",
  });
}

export function LikedCardsPanel() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null);
  const likedCards = useLikedCards({ limit: 200 });
  const allCards = likedCards.likedCards;
  const canExport = !likedCards.likedCardsQuery.isLoading && allCards.length > 0;

  const routeOptions = useMemo(
    () =>
      Array.from(
        new Set(allCards.map((card) => card.route_label).filter((value): value is string => Boolean(value))),
      ),
    [allCards],
  );
  const workflowOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allCards
            .map((card) => card.graph_config_name || card.graph_type)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [allCards],
  );
  const filteredCards = useMemo(() => {
    const query = normalizeSearchValue(searchTerm);
    return allCards.filter((card) => {
      const workflow = card.graph_config_name || card.graph_type || "";
      const searchable = [
        card.title,
        card.content,
        card.route_label,
        card.conversation_title,
        workflow,
        card.source_node_label,
        card.source_node_name,
      ]
        .map((value) => normalizeSearchValue(value))
        .join(" ");

      if (query && !searchable.includes(query)) {
        return false;
      }
      if (activeRoute && card.route_label !== activeRoute) {
        return false;
      }
      if (activeWorkflow && workflow !== activeWorkflow) {
        return false;
      }
      return true;
    });
  }, [activeRoute, activeWorkflow, allCards, searchTerm]);

  const activeFilterCount = Number(Boolean(searchTerm.trim())) + Number(Boolean(activeRoute)) + Number(Boolean(activeWorkflow));

  function clearFilters() {
    setSearchTerm("");
    setActiveRoute(null);
    setActiveWorkflow(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-semibold text-slate-950">好卡片</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            这里会收集你点过赞的洞察卡片，并保留当时的生成流程，方便后续复盘哪些标题、路由、提示词和节点输出更值得保留。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => exportLikedCards(likedCards.likedCards, "markdown")}
            disabled={!canExport}
            title="导出为 Markdown"
          >
            <Download className="h-4 w-4" />
            导出 MD
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => exportLikedCards(likedCards.likedCards, "json")}
            disabled={!canExport}
            title="导出为 JSON"
          >
            <Download className="h-4 w-4" />
            导出 JSON
          </Button>
        </div>
      </div>

      {!likedCards.likedCardsQuery.isLoading && allCards.length > 0 ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="搜索标题、内容、来源对话、工作流..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>

            <div className="grid grid-cols-3 gap-2 text-center md:w-[21rem]">
              <div className="rounded-2xl bg-white px-3 py-2">
                <div className="text-lg font-semibold text-slate-950">{allCards.length}</div>
                <div className="text-[11px] text-slate-500">总卡片</div>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2">
                <div className="text-lg font-semibold text-slate-950">{routeOptions.length}</div>
                <div className="text-[11px] text-slate-500">路由</div>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2">
                <div className="text-lg font-semibold text-slate-950">{filteredCards.length}</div>
                <div className="text-[11px] text-slate-500">当前展示</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {routeOptions.slice(0, 10).map((route) => (
              <button
                key={route}
                type="button"
                onClick={() => setActiveRoute((current) => (current === route ? null : route))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeRoute === route
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {route}
              </button>
            ))}
            {workflowOptions.slice(0, 8).map((workflow) => (
              <button
                key={workflow}
                type="button"
                onClick={() => setActiveWorkflow((current) => (current === workflow ? null : workflow))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeWorkflow === workflow
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {workflow}
              </button>
            ))}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
                清空筛选
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {likedCards.likedCardsQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          正在加载好卡片...
        </div>
      ) : likedCards.likedCards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
          <Heart className="mx-auto h-7 w-7 text-slate-300" />
          <div className="mt-3 text-sm font-semibold text-slate-800">还没有点赞过的卡片</div>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            在洞察卡片右上角点击“点赞”，好的生成结果就会出现在这里。
          </p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
          <Search className="mx-auto h-7 w-7 text-slate-300" />
          <div className="mt-3 text-sm font-semibold text-slate-800">没有匹配的好卡片</div>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            换个关键词，或者清空筛选再看看。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredCards.map((card) => (
            (() => {
              const generationLogs = getGenerationLogs(card.workflow_snapshot);
              const promptPreviews = getPromptPreviews(card.workflow_snapshot);
              const sourceStateEntries = Object.entries(card.source_state_patch ?? {});
              const requestId = asString(card.source_request_id);
              const workflowName = card.graph_config_name || card.graph_type || "未记录工作流";
              const sourceLabel = formatNodeLabel(card.source_node_name, card.source_node_label);
              const contentPreview = summarizeText(card.content, 280);

              return (
                <article
                  key={card.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {card.route_label ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                            {card.route_label}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          {card.conversation_title || `会话 ${card.conversation_id}`}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          卡片 {card.card_index}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600">
                          {workflowName}
                        </span>
                        {card.source_node_name ? (
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                            {sourceLabel}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="font-display text-xl font-semibold leading-tight text-slate-950">
                        {card.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>收藏于 {formatDateTime(card.created_at)}</span>
                        <span>·</span>
                        <span>来自 {card.conversation_title || `会话 ${card.conversation_id}`}</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => void likedCards.unlikeCard(card.id)}
                      disabled={likedCards.unlikingCard}
                      title="取消点赞"
                    >
                      {likedCards.unlikingCard ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="px-5 py-4">
                    <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {contentPreview}
                    </div>
                    {contentPreview !== card.content ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                          展开完整内容
                        </summary>
                        <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">
                          {card.content}
                        </div>
                      </details>
                    ) : null}
                  </div>

                  <details className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      生成流程记录
                    </summary>

                    <div className="mt-4 grid gap-4 text-sm text-slate-600">
                      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="font-semibold text-slate-900">流程索引</div>
                        <div>工作流：{workflowName}</div>
                        <div>源节点：{sourceLabel}</div>
                        <div>Request：{requestId || "未匹配到同次生成日志"}</div>
                      </div>

                      {sourceStateEntries.length > 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="font-semibold text-slate-900">节点状态补丁</div>
                          <div className="mt-2 grid gap-2">
                            {sourceStateEntries.map(([key, value]) => (
                              <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  {key}
                                </div>
                                <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-700">
                                  {displayValue(value)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {generationLogs.length > 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="font-semibold text-slate-900">同次生成的节点日志</div>
                          <div className="mt-3 grid gap-3">
                            {generationLogs.map((log, index) => {
                              const nodeName = asString(log.node_name);
                              const nodeLabel = asString(log.node_label);
                              const model = asString(log.model);
                              const inputMessages = asArray(log.input_messages).map(asRecord);
                              const responseText = asString(log.response_text);

                              return (
                                <details
                                  key={`${asString(log.request_id) ?? "log"}-${index}`}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                                >
                                  <summary className="cursor-pointer font-medium text-slate-800">
                                    {formatNodeLabel(nodeName, nodeLabel)}
                                    {model ? ` · ${model}` : ""}
                                  </summary>
                                  <div className="mt-3 grid gap-3">
                                    {inputMessages.length > 0 ? (
                                      <div>
                                        <div className="text-xs font-semibold text-slate-500">
                                          输入消息 / Prompt
                                        </div>
                                        <div className="mt-2 grid gap-2">
                                          {inputMessages.map((message, messageIndex) => (
                                            <div
                                              key={messageIndex}
                                              className="rounded-xl bg-white px-3 py-2"
                                            >
                                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                                {asString(message.role) || "message"}
                                              </div>
                                              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-700">
                                                {asString(message.content) || ""}
                                              </pre>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {responseText ? (
                                      <div>
                                        <div className="text-xs font-semibold text-slate-500">
                                          节点输出
                                        </div>
                                        <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-white px-3 py-2 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-700">
                                          {responseText}
                                        </pre>
                                      </div>
                                    ) : null}
                                  </div>
                                </details>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {promptPreviews.length > 0 ? (
                        <details className="rounded-2xl border border-slate-200 bg-white p-4">
                          <summary className="cursor-pointer font-semibold text-slate-900">
                            当前工作流提示词预览
                          </summary>
                          <div className="mt-3 grid gap-3">
                            {promptPreviews.map((preview) => (
                              <div
                                key={asString(preview.node) || asString(preview.node_label)}
                                className="rounded-2xl bg-slate-50 p-3"
                              >
                                <div className="font-medium text-slate-800">
                                  {formatNodeLabel(
                                    asString(preview.node),
                                    asString(preview.node_label),
                                  )}
                                </div>
                                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-700">
                                  {asString(preview.prompt_preview) || ""}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </details>
                </article>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}
