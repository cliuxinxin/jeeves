"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createLikedCard,
  deleteLikedCard,
  listLikedCards,
  type LikedCardCreateRequest,
  type LikedCardListResponse,
} from "@/lib/api/client";

import { queryKeys } from "./query-keys";

type UseLikedCardsOptions = {
  conversationId?: number | null;
  limit?: number;
  enabled?: boolean;
};

export function likedCardSourceKey(sourceMessageId: number, cardIndex: number) {
  return `${sourceMessageId}:${cardIndex}`;
}

export function useLikedCards({
  conversationId = null,
  limit = 100,
  enabled = true,
}: UseLikedCardsOptions = {}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.likedCards({ conversationId, limit });

  const likedCardsQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      listLikedCards(
        {
          conversation_id: conversationId ?? undefined,
          limit,
        },
        signal,
      ),
    enabled,
    staleTime: 5_000,
  });

  const likedCardBySource = useMemo(() => {
    const map = new Map<string, LikedCardListResponse["items"][number]>();
    for (const card of likedCardsQuery.data?.items ?? []) {
      map.set(likedCardSourceKey(card.source_message_id, card.card_index), card);
    }
    return map;
  }, [likedCardsQuery.data?.items]);

  const likeCardMutation = useMutation({
    mutationFn: (payload: LikedCardCreateRequest) => createLikedCard(payload),
    onSuccess: (likedCard) => {
      queryClient.setQueryData<LikedCardListResponse>(queryKey, (current) => ({
        items: [
          likedCard,
          ...(current?.items ?? []).filter((item) => item.id !== likedCard.id),
        ],
      }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.likedCardsRoot });
    },
  });

  const unlikeCardMutation = useMutation({
    mutationFn: (likedCardId: number) => deleteLikedCard(likedCardId),
    onSuccess: (_, likedCardId) => {
      queryClient.setQueryData<LikedCardListResponse>(queryKey, (current) => ({
        items: (current?.items ?? []).filter((item) => item.id !== likedCardId),
      }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.likedCardsRoot });
    },
  });

  return {
    likedCards: likedCardsQuery.data?.items ?? [],
    likedCardsQuery,
    likedCardBySource,
    likeCard: likeCardMutation.mutateAsync,
    unlikeCard: unlikeCardMutation.mutateAsync,
    likingCard: likeCardMutation.isPending,
    unlikingCard: unlikeCardMutation.isPending,
  };
}
