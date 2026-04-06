export const queryKeys = {
  health: ["health"] as const,
  conversations: ["conversations"] as const,
  conversation: (conversationId: number | null) => ["conversation", conversationId] as const,
  llmConfigs: ["llm-configs"] as const,
  graphConfigs: ["graph-configs"] as const,
};
