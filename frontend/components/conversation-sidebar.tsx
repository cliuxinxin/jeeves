"use client";

import { Plus, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationSummary } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ConversationSidebarProps = {
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  onSelectConversation: (conversationId: number) => void;
  onDeleteConversation: (conversationId: number) => void;
  onCreateConversation: () => void;
};

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onCreateConversation,
}: ConversationSidebarProps) {
  return (
    <aside className="hidden w-72 border-r border-slate-200/80 bg-white/70 p-4 backdrop-blur md:flex md:flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold text-slate-950">Jeeves</div>
          <div className="mt-1 text-sm text-slate-500">历史对话</div>
        </div>
        <Button type="button" size="icon" variant="secondary" onClick={onCreateConversation}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 pr-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group relative w-full rounded-3xl border px-4 py-3 text-left transition-colors",
                conversation.id === activeConversationId
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
              )}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className="truncate pr-6 text-sm font-semibold">{conversation.title}</div>
                <div
                  className={cn(
                    "mt-1 line-clamp-2 text-xs leading-5",
                    conversation.id === activeConversationId ? "text-slate-300" : "text-slate-500",
                  )}
                >
                  {conversation.preview || "暂无消息"}
                </div>
              </button>
              <button
                type="button"
                className="absolute right-3 top-3 hidden rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-500 hover:text-white group-hover:block"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteConversation(conversation.id);
                }}
                title="删除对话"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
