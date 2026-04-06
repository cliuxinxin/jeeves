"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationDetailResponse,
  type ConversationRecord,
} from "@/lib/api/client";

import { queryKeys } from "./query-keys";

export function useConversations() {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations,
    queryFn: ({ signal }) => listConversations(signal),
  });

  const conversationDetailQuery = useQuery({
    queryKey: queryKeys.conversation(activeConversationId),
    queryFn: ({ signal }) => {
      if (activeConversationId === null) {
        throw new Error("Missing conversation id.");
      }
      return getConversation(activeConversationId, signal);
    },
    enabled: activeConversationId !== null,
  });

  const createConversationMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      setActiveConversationId(conversation.id);
      queryClient.setQueryData<ConversationDetailResponse>(queryKeys.conversation(conversation.id), {
        conversation,
        messages: [],
      });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: async (_, deletedConversationId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.removeQueries({ queryKey: queryKeys.conversation(deletedConversationId) });
    },
  });

  useEffect(() => {
    if (conversationsQuery.isLoading || createConversationMutation.isPending) {
      return;
    }

    const items = conversationsQuery.data?.items ?? [];
    if (items.length === 0 && !createConversationMutation.isPending) {
      void createConversationMutation.mutateAsync();
      return;
    }

    if (
      items.length > 0 &&
      (activeConversationId === null || !items.some((item) => item.id === activeConversationId))
    ) {
      setActiveConversationId(items[0].id);
    }
  }, [
    activeConversationId,
    conversationsQuery.data?.items,
    conversationsQuery.isLoading,
    createConversationMutation.isPending,
    createConversationMutation.mutateAsync,
  ]);

  const activeConversation = useMemo(() => {
    return (
      conversationsQuery.data?.items.find((conversation) => conversation.id === activeConversationId) ?? null
    );
  }, [activeConversationId, conversationsQuery.data?.items]);

  async function selectConversation(conversationId: number) {
    setActiveConversationId(conversationId);
  }

  async function createNewConversation(): Promise<ConversationRecord> {
    return createConversationMutation.mutateAsync();
  }

  async function removeConversation(conversationId: number): Promise<void> {
    await deleteConversationMutation.mutateAsync(conversationId);

    const remainingItems =
      queryClient.getQueryData<{ items: Array<{ id: number }> }>(queryKeys.conversations)?.items ?? [];

    if (activeConversationId === conversationId) {
      const fallbackConversation = remainingItems.find((item) => item.id !== conversationId);
      if (fallbackConversation) {
        setActiveConversationId(fallbackConversation.id);
      } else {
        const created = await createConversationMutation.mutateAsync();
        setActiveConversationId(created.id);
      }
    }
  }

  return {
    conversations: conversationsQuery.data?.items ?? [],
    conversationsQuery,
    activeConversationId,
    activeConversation,
    activeConversationDetail: conversationDetailQuery.data ?? null,
    activeConversationMessages: conversationDetailQuery.data?.messages ?? [],
    isBootstrapping:
      conversationsQuery.isLoading ||
      createConversationMutation.isPending ||
      (activeConversationId !== null && conversationDetailQuery.isLoading),
    isConversationLoading: conversationDetailQuery.isFetching && activeConversationId !== null,
    selectConversation,
    setActiveConversationId,
    createNewConversation,
    removeConversation,
  };
}
