export const queryKeys = {
  health: ["health"] as const,
  conversations: ["conversations"] as const,
  conversation: (conversationId: number | null) => ["conversation", conversationId] as const,
  likedCardsRoot: ["liked-cards"] as const,
  likedCards: (filters?: { conversationId?: number | null; limit?: number }) =>
    ["liked-cards", filters ?? {}] as const,
  llmConfigs: ["llm-configs"] as const,
  graphConfigs: ["graph-configs"] as const,
  aiLogs: (filters: {
    conversationId?: number | null;
    requestId?: string;
    status?: string;
    nodeName?: string;
    graphConfigId?: number | null;
    limit?: number;
  }) => ["ai-logs", filters] as const,
};
