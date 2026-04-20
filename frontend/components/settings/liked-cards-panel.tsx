"use client";

import { Heart, LoaderCircle, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLikedCards } from "@/hooks/use-liked-cards";
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

function getGenerationLogs(snapshot: unknown): JsonRecord[] {
  const generation = asRecord(asRecord(snapshot).generation);
  return asArray(generation.logs).map(asRecord);
}

function getPromptPreviews(snapshot: unknown): JsonRecord[] {
  const graphConfig = asRecord(asRecord(snapshot).graph_config);
  return asArray(graphConfig.prompt_previews).map(asRecord);
}

export function LikedCardsPanel() {
  const likedCards = useLikedCards({ limit: 200 });

  return (
    <div className="space-y-5">
      <div>
        <div className="font-display text-2xl font-semibold text-slate-950">好卡片</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          这里会收集你点过赞的洞察卡片，并保留当时的生成流程，方便后续复盘哪些标题、路由、提示词和节点输出更值得保留。
        </p>
      </div>

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
      ) : (
        <div className="grid gap-4">
          {likedCards.likedCards.map((card) => (
            (() => {
              const generationLogs = getGenerationLogs(card.workflow_snapshot);
              const promptPreviews = getPromptPreviews(card.workflow_snapshot);
              const sourceStateEntries = Object.entries(card.source_state_patch ?? {});
              const requestId = asString(card.source_request_id);

              return (
                <article
                  key={card.id}
                  className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.06)]"
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
                        {card.graph_config_name ? (
                          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600">
                            {card.graph_config_name}
                          </span>
                        ) : null}
                        {card.source_node_name ? (
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                            {formatNodeLabel(card.source_node_name, card.source_node_label)}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="font-display text-xl font-semibold leading-tight text-slate-950">
                        {card.title}
                      </h3>
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

                  <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-7 text-slate-700">
                    {card.content}
                  </div>

                  <details className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      生成流程记录
                    </summary>

                    <div className="mt-4 grid gap-4 text-sm text-slate-600">
                      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="font-semibold text-slate-900">流程索引</div>
                        <div>工作流：{card.graph_config_name || card.graph_type || "未记录"}</div>
                        <div>
                          源节点：
                          {formatNodeLabel(card.source_node_name, card.source_node_label)}
                        </div>
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
