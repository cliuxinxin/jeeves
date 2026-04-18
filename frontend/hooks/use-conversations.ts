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
  type ConversationListResponse,
  type ConversationRecord,
  type ConversationSummary,
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

  function toConversationSummary(
    conversation: ConversationRecord,
    overrides?: Partial<ConversationSummary>,
  ): ConversationSummary {
    return {
      ...conversation,
      preview: overrides?.preview ?? "",
      message_count: overrides?.message_count ?? 0,
    };
  }

  function upsertConversationSummary(conversation: ConversationRecord) {
    queryClient.setQueryData<ConversationListResponse>(queryKeys.conversations, (current) => {
      const nextSummary = toConversationSummary(
        conversation,
        current?.items.find((item) => item.id === conversation.id) ?? undefined,
      );

      const remainingItems = (current?.items ?? []).filter((item) => item.id !== conversation.id);
      return {
        items: [nextSummary, ...remainingItems],
      };
    });
  }

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
    refetchOnMount: false,
  });

  const createConversationMutation = useMutation({
    mutationFn: (payload: ConversationCreateRequest) => createConversation(payload),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.conversations });
    },
    onSuccess: (conversation) => {
      upsertConversationSummary(conversation);
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.conversations });
    },
    onSuccess: (conversation) => {
      upsertConversationSummary(conversation);
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.conversations });
    },
    onSuccess: (_, deletedConversationId) => {
      queryClient.setQueryData<ConversationListResponse>(queryKeys.conversations, (current) => ({
        items: (current?.items ?? []).filter((item) => item.id !== deletedConversationId),
      }));
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
      (activeConversationId !== null &&
        conversationDetailQuery.isLoading &&
        conversationDetailQuery.data === undefined),
    isConversationLoading:
      conversationDetailQuery.isFetching &&
      activeConversationId !== null &&
      conversationDetailQuery.data === undefined,
    selectConversation,
    setActiveConversationId,
    createNewConversation,
    updateConversationConfig,
    removeConversation,
  };
}
