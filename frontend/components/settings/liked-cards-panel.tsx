"use client";

import { Heart, LoaderCircle, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLikedCards } from "@/hooks/use-liked-cards";

export function LikedCardsPanel() {
  const likedCards = useLikedCards({ limit: 200 });

  return (
    <div className="space-y-5">
      <div>
        <div className="font-display text-2xl font-semibold text-slate-950">好卡片</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          这里会收集你点过赞的洞察卡片，方便后续复盘哪些标题、路由和判断更值得保留。
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
