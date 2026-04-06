"use client";

import { useQuery } from "@tanstack/react-query";

import { getHealth } from "@/lib/api/client";

import { queryKeys } from "./query-keys";

export function useRuntimeStatus() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
  });
}
