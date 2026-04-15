"use client";

import { useQuery } from "@tanstack/react-query";

import { listAILogs, type AILogStatus } from "@/lib/api/client";

import { queryKeys } from "./query-keys";

type UseAILogsFilters = {
  conversationId?: number | null;
  requestId?: string;
  status?: AILogStatus | "";
  nodeName?: string;
  graphConfigId?: number | null;
  limit?: number;
};

export function useAILogs(filters: UseAILogsFilters, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.aiLogs({
      conversationId: filters.conversationId ?? null,
      requestId: filters.requestId?.trim() ?? "",
      status: filters.status ?? "",
      nodeName: filters.nodeName?.trim() ?? "",
      graphConfigId: filters.graphConfigId ?? null,
      limit: filters.limit ?? 50,
    }),
    queryFn: ({ signal }) =>
      listAILogs(
        {
          conversation_id: filters.conversationId ?? undefined,
          request_id: filters.requestId?.trim() || undefined,
          status: filters.status || undefined,
          node_name: filters.nodeName?.trim() || undefined,
          graph_config_id: filters.graphConfigId ?? undefined,
          limit: filters.limit ?? 50,
        },
        signal,
      ),
    enabled,
    staleTime: 5_000,
  });
}
