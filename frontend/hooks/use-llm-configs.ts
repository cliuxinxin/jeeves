"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  activateLLMConfig,
  createLLMConfig,
  deleteLLMConfig,
  listLLMConfigs,
  testLLMConfig,
  updateLLMConfig,
  type LLMConfigCreateRequest,
  type LLMConfigUpdateRequest,
} from "@/lib/api/client";

import { queryKeys } from "./query-keys";

export function useLLMConfigs() {
  const queryClient = useQueryClient();

  const configsQuery = useQuery({
    queryKey: queryKeys.llmConfigs,
    queryFn: ({ signal }) => listLLMConfigs(signal),
  });

  const createMutation = useMutation({
    mutationFn: (payload: LLMConfigCreateRequest) => createLLMConfig(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.llmConfigs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ configId, payload }: { configId: number; payload: LLMConfigUpdateRequest }) =>
      updateLLMConfig(configId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.llmConfigs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
  });

  const activateMutation = useMutation({
    mutationFn: activateLLMConfig,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.llmConfigs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLLMConfig,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.llmConfigs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
  });

  const testMutation = useMutation({
    mutationFn: testLLMConfig,
  });

  return {
    configs: configsQuery.data?.items ?? [],
    activeConfigId: configsQuery.data?.active_config_id ?? null,
    configsQuery,
    createConfig: createMutation.mutateAsync,
    updateConfig: updateMutation.mutateAsync,
    activateConfig: activateMutation.mutateAsync,
    deleteConfig: deleteMutation.mutateAsync,
    testConfig: testMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isTesting: testMutation.isPending,
    activatingId: activateMutation.isPending ? (activateMutation.variables ?? null) : null,
    deletingId: deleteMutation.variables ?? null,
  };
}
