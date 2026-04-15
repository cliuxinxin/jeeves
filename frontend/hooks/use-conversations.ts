"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationDetailResponse,
  type ConversationCreateRequest,
  type ConversationRecord,
  type ConversationUpdateRequest,
  updateConversation,
} from "@/lib/api/client";

import { queryKeys } from "./query-keys";

type CreateConversationOptions = {
  title?: string;
  graph_config_id?: number | null;
};

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
    mutationFn: (payload: ConversationCreateRequest) => createConversation(payload),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      setActiveConversationId(conversation.id);
      queryClient.setQueryData<ConversationDetailResponse>(queryKeys.conversation(conversation.id), {
        conversation,
        messages: [],
      });
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: ({
      conversationId,
      payload,
    }: {
      conversationId: number;
      payload: ConversationUpdateRequest;
    }) => updateConversation(conversationId, payload),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.setQueryData<ConversationDetailResponse>(
        queryKeys.conversation(conversation.id),
        (current) => ({
          conversation,
          messages: current?.messages ?? [],
        }),
      );
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
    if (conversationsQuery.isLoading) {
      return;
    }

    const items = conversationsQuery.data?.items ?? [];
    if (items.length === 0) {
      if (activeConversationId !== null) {
        setActiveConversationId(null);
      }
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
  ]);

  const activeConversation = useMemo(() => {
    return (
      conversationsQuery.data?.items.find((conversation) => conversation.id === activeConversationId) ?? null
    );
  }, [activeConversationId, conversationsQuery.data?.items]);

  async function selectConversation(conversationId: number) {
    setActiveConversationId(conversationId);
  }

  async function createNewConversation(payload?: CreateConversationOptions): Promise<ConversationRecord> {
    return createConversationMutation.mutateAsync({
      title: payload?.title ?? "New chat",
      graph_config_id: payload?.graph_config_id,
    });
  }

  async function updateConversationConfig(conversationId: number, graphConfigId: number | null) {
    return updateConversationMutation.mutateAsync({
      conversationId,
      payload: { graph_config_id: graphConfigId },
    });
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
        setActiveConversationId(null);
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
    isUpdatingConversation: updateConversationMutation.isPending,
    isBootstrapping:
      conversationsQuery.isLoading ||
      createConversationMutation.isPending ||
      (activeConversationId !== null && conversationDetailQuery.isLoading),
    isConversationLoading: conversationDetailQuery.isFetching && activeConversationId !== null,
    selectConversation,
    setActiveConversationId,
    createNewConversation,
    updateConversationConfig,
    removeConversation,
  };
}
