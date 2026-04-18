"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  LoaderCircle,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Settings2,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GraphConfigRecord, HealthResponse } from "@/lib/api/client";
import { copyElementAsImage } from "@/lib/copy-element-as-image";
import { formatNodeLabel, stageAccentClass } from "@/lib/node-ui";
import type { StreamedAssistantMessage } from "@/hooks/use-chat-stream";
import { cn } from "@/lib/utils";

export type ChatPaneMessage = {
  id: number | string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  node?: string;
  node_label?: string | null;
  state_patch?: Record<string, string>;
};

type ChatPaneProps = {
  title: string;
  runtimeStatus: HealthResponse | null;
  graphConfigs: GraphConfigRecord[];
  activeGraphId: number | null;
  messages: ChatPaneMessage[];
  streamingMessages: StreamedAssistantMessage[];
  notice: string | null;
  input: string;
  error: string | null;
  isBootstrapping: boolean;
  isConversationLoading: boolean;
  isSending: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onToggleTrace: () => void;
  onActivateGraphConfig: (configId: number) => void;
  isTraceOpen: boolean;
  authUsername?: string | null;
  onLogout?: () => void;
  isAuthMutating?: boolean;
};

type StateEntry = [string, string];

type InsightCardLayout = {
  preface: string | null;
  sections: Array<{
    title: string;
    body: string;
  }>;
};

function entriesFromStatePatch(statePatch?: Record<string, string>) {
  return Object.entries(statePatch ?? {}).filter(([, value]) => value) as StateEntry[];
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/(^|\n)[·•●▪◦]\s+/g, "$1- ")
    .replace(/(^|\n)-(?=\S)/g, "$1- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeComparableText(content: string) {
  return normalizeMarkdown(content).replace(/\s+/g, " ").trim();
}

function isEffectivelySameContent(left: string, right: string) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function stripMarkdownInline(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/^#+\s*/gm, "")
    .trim();
}

function summarizeText(text: string, maxLength = 160) {
  const normalized = normalizeComparableText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function stripValueRouteFooter(content: string) {
  return normalizeMarkdown(content).replace(/\n*【价值路由[:：]\s*[\s\S]*?】\s*$/, "").trim();
}

function parseListValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return [];
  }

  const quotedMatches = Array.from(trimmed.matchAll(/['"]([^'"]+)['"]/g))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  if (quotedMatches.length > 0) {
    return quotedMatches;
  }

  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterDisplayStateEntries(entries: StateEntry[], content: string) {
  const normalizedContent = normalizeComparableText(content);
  return entries.filter(([key, value]) => {
    if (key !== "final_output") {
      return true;
    }
    return normalizeComparableText(value) !== normalizedContent;
  });
}

function extractInsightCardLayout(content: string): InsightCardLayout | null {
  const normalized = normalizeMarkdown(content);
  const headingMatches = Array.from(normalized.matchAll(/^#{2,6}\s+(.+)$/gm));

  if (headingMatches.length < 2) {
    return null;
  }

  const sections = headingMatches
    .map((match, index) => {
      const sectionStart = match.index ?? 0;
      const bodyStart = sectionStart + match[0].length;
      const nextHeadingStart = headingMatches[index + 1]?.index ?? normalized.length;
      return {
        title: stripMarkdownInline(match[1] ?? ""),
        body: normalized.slice(bodyStart, nextHeadingStart).trim(),
      };
    })
    .filter((section) => section.title && section.body);

  const insightSections = sections.filter((section) => /洞察卡片|卡片\s*\d+/i.test(section.title));
  if (insightSections.length < 2) {
    return null;
  }

  const firstHeadingIndex = headingMatches[0]?.index ?? 0;
  const preface = normalized.slice(0, firstHeadingIndex).trim();

  return {
    preface: preface || null,
    sections: insightSections,
  };
}

function parseInsightTitle(title: string) {
  const normalizedTitle = stripMarkdownInline(title);
  const match = normalizedTitle.match(/^(?:洞察)?卡片\s*(\d+)\s*[：:]\s*(.+)$/);
  const badge = match ? `卡片 ${match[1]}` : null;
  const titleBody = match ? match[2] : normalizedTitle;

  const segments = titleBody.split(/[：:]/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length >= 2 && segments[0] && segments[0].length <= 12) {
    return {
      badge,
      category: segments[0],
      heading: segments.slice(1).join("："),
    };
  }

  return {
    badge,
    category: null,
    heading: titleBody,
  };
}

function extractLeadQuestion(content: string) {
  const normalized = normalizeMarkdown(content);
  const boldMatch = normalized.match(/^\*\*(.+?[？?])\*\*\s*\n+([\s\S]+)$/);
  if (boldMatch) {
    return {
      question: stripMarkdownInline(boldMatch[1] ?? ""),
      content: boldMatch[2]?.trim() ?? "",
    };
  }

  const plainMatch = normalized.match(/^(.{1,40}[？?])\s*\n+([\s\S]+)$/);
  if (plainMatch) {
    return {
      question: stripMarkdownInline(plainMatch[1] ?? ""),
      content: plainMatch[2]?.trim() ?? "",
    };
  }

  return {
    question: null,
    content: normalized,
  };
}

function getInsightTone(category: string | null, index: number) {
  const normalizedCategory = (category ?? "").trim();

  if (/信号|趋势|市场/.test(normalizedCategory)) {
    return {
      card: "bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/60",
      bar: "bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500",
      pill: "border border-sky-200 bg-sky-100/90 text-sky-800",
      question: "border border-sky-200/80 bg-sky-50/85 text-sky-900",
      badge: "border border-sky-200/80 bg-white/90 text-sky-700",
      shadow: "shadow-[0_14px_34px_rgba(14,165,233,0.08)]",
    };
  }

  if (/框架|路径|方法|部署|模型/.test(normalizedCategory)) {
    return {
      card: "bg-gradient-to-br from-amber-50/95 via-white to-orange-50/50",
      bar: "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500",
      pill: "border border-amber-200 bg-amber-100/90 text-amber-800",
      question: "border border-amber-200/80 bg-amber-50/85 text-amber-900",
      badge: "border border-amber-200/80 bg-white/90 text-amber-700",
      shadow: "shadow-[0_14px_34px_rgba(245,158,11,0.08)]",
    };
  }

  if (/反常识|观点|风险|提醒|警报/.test(normalizedCategory)) {
    return {
      card: "bg-gradient-to-br from-rose-50/95 via-white to-fuchsia-50/45",
      bar: "bg-gradient-to-r from-rose-400 via-pink-400 to-fuchsia-500",
      pill: "border border-rose-200 bg-rose-100/90 text-rose-800",
      question: "border border-rose-200/80 bg-rose-50/85 text-rose-900",
      badge: "border border-rose-200/80 bg-white/90 text-rose-700",
      shadow: "shadow-[0_14px_34px_rgba(244,63,94,0.08)]",
    };
  }

  return [
    {
      card: "bg-gradient-to-br from-slate-50/95 via-white to-slate-100/60",
      bar: "bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600",
      pill: "border border-slate-200 bg-slate-100/90 text-slate-700",
      question: "border border-slate-200/80 bg-slate-50/90 text-slate-800",
      badge: "border border-slate-200/80 bg-white/90 text-slate-600",
      shadow: "shadow-[0_14px_34px_rgba(15,23,42,0.06)]",
    },
    {
      card: "bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/50",
      bar: "bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500",
      pill: "border border-emerald-200 bg-emerald-100/90 text-emerald-800",
      question: "border border-emerald-200/80 bg-emerald-50/85 text-emerald-900",
      badge: "border border-emerald-200/80 bg-white/90 text-emerald-700",
      shadow: "shadow-[0_14px_34px_rgba(16,185,129,0.08)]",
    },
  ][index % 2];
}

function buildCollapsedPreview(options: {
  insightLayout: InsightCardLayout | null;
  routeReasonText: string;
  valueRoutes: string[];
}) {
  if (options.insightLayout && options.insightLayout.sections.length > 0) {
    const first = parseInsightTitle(options.insightLayout.sections[0].title);
    return `${options.insightLayout.sections.length} 张卡片 · ${first.heading}`;
  }

  if (options.routeReasonText) {
    return summarizeText(options.routeReasonText, 90);
  }

  if (options.valueRoutes.length > 0) {
    return options.valueRoutes.join(" · ");
  }

  return null;
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

function MarkdownBlock({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-slate-700",
        "prose-headings:font-inherit prose-headings:text-inherit",
        "prose-p:my-2.5 prose-p:leading-7 prose-li:leading-7 prose-strong:text-slate-950 prose-ul:my-3 prose-ol:my-3",
        "prose-code:before:content-none prose-code:after:content-none",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {normalizeMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}

export function ChatPane({
  title,
  runtimeStatus,
  graphConfigs,
  activeGraphId,
  messages,
  streamingMessages,
  notice,
  input,
  error,
  isBootstrapping,
  isConversationLoading,
  isSending,
  onInputChange,
  onSend,
  onNewConversation,
  onOpenSettings,
  onToggleTrace,
  onActivateGraphConfig,
  isTraceOpen,
  authUsername,
  onLogout,
  isAuthMutating,
}: ChatPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const insightCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<
    Record<string, "idle" | "copying" | "copied" | "downloaded" | "error">
  >({});

  const displayMessages = useMemo(
    () => [...messages, ...streamingMessages],
    [messages, streamingMessages],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [displayMessages, isSending]);

  useEffect(() => {
    setExpandedMessages((current) => {
      let changed = false;
      const next = { ...current };

      for (const message of displayMessages) {
        if (message.role !== "assistant" || !message.node) {
          continue;
        }

        const key = String(message.id);
        if (!(key in next)) {
          next[key] = message.node !== "value_router";
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [displayMessages]);

  async function handleCopyInsightCard(cardKey: string) {
    const cardElement = insightCardRefs.current[cardKey];
    if (!cardElement) {
      setCopyState((current) => ({ ...current, [cardKey]: "error" }));
      return;
    }

    setCopyState((current) => ({ ...current, [cardKey]: "copying" }));

    try {
      const result = await copyElementAsImage(cardElement);
      setCopyState((current) => ({
        ...current,
        [cardKey]: result === "download" ? "downloaded" : "copied",
      }));
      window.setTimeout(() => {
        setCopyState((current) => {
          if (current[cardKey] !== "copied" && current[cardKey] !== "downloaded") {
            return current;
          }
          return { ...current, [cardKey]: "idle" };
        });
      }, 1800);
    } catch {
      setCopyState((current) => ({ ...current, [cardKey]: "error" }));
      window.setTimeout(() => {
        setCopyState((current) => {
          if (current[cardKey] !== "error") {
            return current;
          }
          return { ...current, [cardKey]: "idle" };
        });
      }, 2200);
    }
  }

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
                <span className="text-sm text-slate-500">当前会话工作流:</span>
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
            {authUsername ? (
              <Button type="button" variant="secondary" className="h-10 px-3" onClick={onLogout} disabled={isAuthMutating}>
                {isAuthMutating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                退出 ({authUsername})
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="h-10 px-3" onClick={onNewConversation}>
              <Plus className="h-4 w-4" />
              新对话
            </Button>
            <Button type="button" variant="secondary" className="h-10 px-3" onClick={onToggleTrace}>
              {isTraceOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              轨迹
            </Button>
            <Button type="button" variant="secondary" size="icon" onClick={onOpenSettings}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex flex-1 flex-col p-0">
        {notice ? (
          <div className="border-b border-amber-200/70 bg-amber-50/80 px-5 py-3 text-sm text-amber-800 sm:px-6">
            {notice}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 px-5 py-5 sm:px-6" viewportRef={viewportRef}>
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
                  {(() => {
                    const stateEntries = entriesFromStatePatch(message.state_patch);
                    const visibleStateEntries = filterDisplayStateEntries(stateEntries, message.content);
                    const valueRouteEntry = visibleStateEntries.find(([key]) => key === "value_routes");
                    const routeReasonEntry = visibleStateEntries.find(([key]) => key === "route_reason");
                    const routeReasonText = routeReasonEntry?.[1] ?? "";
                    const valueRoutes = valueRouteEntry ? parseListValue(valueRouteEntry[1]) : [];
                    const extraStateEntries = visibleStateEntries.filter(
                      ([key]) => key !== "value_routes" && key !== "route_reason",
                    );
                    const insightLayout =
                      message.role === "assistant" ? extractInsightCardLayout(message.content) : null;
                    const cleanedContent = stripValueRouteFooter(message.content);
                    const hideAnalyzerBody =
                      message.node === "value_router" &&
                      Boolean(routeReasonText) &&
                      isEffectivelySameContent(cleanedContent, routeReasonText);
                    const messageKey = String(message.id);
                    const isCollapsible =
                      message.role === "assistant" &&
                      Boolean(message.node) &&
                      (Boolean(insightLayout) || (!hideAnalyzerBody && Boolean(cleanedContent)));
                    const isExpanded = expandedMessages[messageKey] ?? (message.node !== "value_router");
                    const collapsedPreview = buildCollapsedPreview({
                      insightLayout,
                      routeReasonText,
                      valueRoutes,
                    });

                    return (
                      <div
                        className={cn(
                          "max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-6 xl:max-w-[86%]",
                          message.role === "user"
                            ? "max-h-96 overflow-y-auto bg-slate-950 text-white"
                            : cn(
                                "border border-slate-200 text-slate-700 shadow-[0_12px_36px_rgba(15,23,42,0.05)]",
                                message.node ? "border-l-4" : null,
                                message.node ? stageAccentClass(message.node) : "bg-slate-50",
                                message.node === "analyzer" ? "py-2" : null,
                              ),
                        )}
                      >
                        {message.role === "assistant" ? (
                          <div>
                            {message.node ? (
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur">
                                    {formatNodeLabel(message.node, message.node_label)}
                                  </div>
                                  {isCollapsible && !isExpanded && collapsedPreview ? (
                                    <p className="mt-2 line-clamp-2 max-w-[56ch] text-xs leading-5 text-slate-500">
                                      {collapsedPreview}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {insightLayout ? (
                                    <div className="inline-flex items-center rounded-full bg-slate-900/5 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                      {insightLayout.sections.length} 张卡片
                                    </div>
                                  ) : null}
                                  {isCollapsible ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedMessages((current) => ({
                                          ...current,
                                          [messageKey]: !isExpanded,
                                        }))
                                      }
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-500 transition hover:bg-white hover:text-slate-700"
                                      aria-label={isExpanded ? "折叠阶段内容" : "展开阶段内容"}
                                    >
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}

                            {valueRoutes.length > 0 || routeReasonEntry || extraStateEntries.length > 0 ? (
                              <div className="mb-4 rounded-[1.35rem] border border-white/80 bg-white/88 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                                {valueRoutes.length > 0 ? (
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      价值路由
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {valueRoutes.map((route) => (
                                        <span
                                          key={route}
                                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                                        >
                                          {route}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {routeReasonEntry ? (
                                  <div className={cn(valueRoutes.length > 0 ? "mt-3 border-t border-slate-200/80 pt-3" : null)}>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      路由说明
                                    </div>
                                    <p className="mt-2 max-w-[78ch] text-[13px] leading-6 text-slate-600">
                                      {summarizeText(routeReasonText, 220)}
                                    </p>
                                  </div>
                                ) : null}

                                {extraStateEntries.length > 0 ? (
                                  <details className={cn("rounded-xl bg-slate-50/85 px-3 py-2", valueRoutes.length > 0 || routeReasonEntry ? "mt-3" : null)}>
                                    <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      查看状态写入
                                    </summary>
                                    <div className="mt-3 space-y-2">
                                      {extraStateEntries.map(([key, value]) => (
                                        <div key={key} className="grid gap-1 text-xs text-slate-700 sm:grid-cols-[7rem_minmax(0,1fr)]">
                                          <div className="font-semibold text-slate-500">{key}</div>
                                          <div className="whitespace-pre-wrap break-words">{summarizeText(value, 280)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                ) : null}
                              </div>
                            ) : null}

                            {isCollapsible && !isExpanded ? null : insightLayout ? (
                              <div className="space-y-4">
                                {insightLayout.preface ? (
                                  <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
                                    <div className="max-w-[78ch]">
                                      <MarkdownBlock content={insightLayout.preface} />
                                    </div>
                                  </div>
                                ) : null}
                                <div className="grid gap-3">
                                  {insightLayout.sections.map((section, index) => {
                                    const titleMeta = parseInsightTitle(section.title);
                                    const lead = extractLeadQuestion(section.body);
                                    const tone = getInsightTone(titleMeta.category, index);
                                    const cardKey = `${messageKey}-${index}`;
                                    const cardCopyState = copyState[cardKey] ?? "idle";

                                    return (
                                      <section
                                        key={`${message.id}-${index}`}
                                        ref={(element) => {
                                          insightCardRefs.current[cardKey] = element;
                                        }}
                                        className={cn(
                                          "relative overflow-hidden rounded-[1.55rem] border border-slate-200/80 p-4",
                                          tone.card,
                                          tone.shadow,
                                        )}
                                      >
                                        <div className={cn("absolute inset-x-0 top-0 h-1.5", tone.bar)} />
                                        <div className="mb-4 flex items-start justify-between gap-3">
                                          <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              {titleMeta.category ? (
                                                <div className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", tone.pill)}>
                                                  {titleMeta.category}
                                                </div>
                                              ) : null}
                                            </div>
                                            <div className="max-w-[72ch] text-[22px] leading-tight font-semibold tracking-tight text-slate-950">
                                              {titleMeta.heading}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => void handleCopyInsightCard(cardKey)}
                                              disabled={cardCopyState === "copying"}
                                              data-exclude-from-image="true"
                                              className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full border bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-white disabled:cursor-wait disabled:opacity-70",
                                                tone.badge,
                                              )}
                                              aria-label="复制卡片为图片"
                                            >
                                              {cardCopyState === "copying" ? (
                                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                              ) : cardCopyState === "copied" ? (
                                                <Check className="h-3.5 w-3.5" />
                                              ) : cardCopyState === "downloaded" ? (
                                                <Download className="h-3.5 w-3.5" />
                                              ) : (
                                                <Copy className="h-3.5 w-3.5" />
                                              )}
                                              {cardCopyState === "copying"
                                                ? "复制中"
                                                : cardCopyState === "copied"
                                                  ? "已复制"
                                                  : cardCopyState === "downloaded"
                                                    ? "已下载"
                                                  : cardCopyState === "error"
                                                    ? "复制失败"
                                                    : "复制图片"}
                                            </button>
                                            <div className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", tone.badge)}>
                                              {titleMeta.badge ?? `卡片 ${index + 1}`}
                                            </div>
                                          </div>
                                        </div>

                                        {lead.question ? (
                                          <div className={cn("mb-4 rounded-2xl px-3 py-2 text-sm font-medium", tone.question)}>
                                            {lead.question}
                                          </div>
                                        ) : null}

                                        <div className="max-w-[78ch]">
                                          <MarkdownBlock content={lead.content} />
                                        </div>
                                      </section>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : hideAnalyzerBody ? null : (
                              <div className="max-w-[78ch]">
                                <MarkdownBlock content={cleanedContent} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    );
                  })()}
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
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
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
