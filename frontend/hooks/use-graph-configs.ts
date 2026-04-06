"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  activateGraphConfig,
  createGraphConfig,
  deleteGraphConfig,
  listGraphConfigs,
  updateGraphConfig,
  type GraphConfigCreateRequest,
  type GraphConfigUpdateRequest,
} from "@/lib/api/client";

import { queryKeys } from "./query-keys";

export function useGraphConfigs() {
  const queryClient = useQueryClient();

  const configsQuery = useQuery({
    queryKey: queryKeys.graphConfigs,
    queryFn: ({ signal }) => listGraphConfigs(signal),
  });

  const createMutation = useMutation({
    mutationFn: (payload: GraphConfigCreateRequest) => createGraphConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.graphConfigs });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ configId, payload }: { configId: number; payload: GraphConfigUpdateRequest }) =>
      updateGraphConfig(configId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.graphConfigs });
    },
  });

  const activateMutation = useMutation({
    mutationFn: activateGraphConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.graphConfigs });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGraphConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.graphConfigs });
    },
  });

  return {
    configs: configsQuery.data?.items ?? [],
    activeConfigId: configsQuery.data?.active_config_id ?? null,
    configsQuery,
    createConfig: createMutation.mutateAsync,
    updateConfig: updateMutation.mutateAsync,
    activateConfig: activateMutation.mutateAsync,
    deleteConfig: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    activatingId: activateMutation.variables ?? null,
    deletingId: deleteMutation.variables ?? null,
  };
}
