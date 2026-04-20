import createClient from "openapi-fetch";

import { API_URL } from "@/lib/api";

import type { components, paths } from "./generated";

export type GraphType = components["schemas"]["GraphType"];
export type AuthLoginRequest = components["schemas"]["AuthLoginRequest"];
export type AuthSessionResponse = components["schemas"]["AuthSessionResponse"];
export type AILogStatus = components["schemas"]["AILogStatus"];
export type HealthResponse = components["schemas"]["HealthResponse"];
export type ConversationSummary = components["schemas"]["ConversationSummary"];
export type ConversationRecord = components["schemas"]["ConversationRecord"];
export type ConversationMessageRecord = components["schemas"]["ConversationMessageRecord"];
export type ConversationDetailResponse = components["schemas"]["ConversationDetailResponse"];
export type ConversationListResponse = components["schemas"]["ConversationListResponse"];
export type ConversationCreateRequest = components["schemas"]["ConversationCreateRequest"];
export type ConversationUpdateRequest = components["schemas"]["ConversationUpdateRequest"];
export type LikedCardCreateRequest = components["schemas"]["LikedCardCreateRequest"];
export type LikedCardRecord = components["schemas"]["LikedCardRecord"];
export type LikedCardListResponse = components["schemas"]["LikedCardListResponse"];
export type ChatRequest = components["schemas"]["ChatRequest"];
export type ChatResponse = components["schemas"]["ChatResponse"];
export type ChatStreamRequest = components["schemas"]["ChatStreamRequest"];
export type LLMConfigRecord = components["schemas"]["LLMConfigRecord"];
export type LLMConfigCreateRequest = components["schemas"]["LLMConfigCreateRequest"];
export type LLMConfigUpdateRequest = components["schemas"]["LLMConfigUpdateRequest"];
export type LLMConfigListResponse = components["schemas"]["LLMConfigListResponse"];
export type LLMConfigTestRequest = components["schemas"]["LLMConfigTestRequest"];
export type LLMConfigTestResponse = components["schemas"]["LLMConfigTestResponse"];
export type GraphConfigRecord = components["schemas"]["GraphConfigRecord"];
export type GraphConfigCreateRequest = components["schemas"]["GraphConfigCreateRequest"];
export type GraphConfigUpdateRequest = components["schemas"]["GraphConfigUpdateRequest"];
export type GraphConfigListResponse = components["schemas"]["GraphConfigListResponse"];
export type GraphPromptPreviewRequest = components["schemas"]["GraphPromptPreviewRequest"];
export type GraphNodePromptPreview = components["schemas"]["GraphNodePromptPreview"];
export type GraphStateSlotPreview = components["schemas"]["GraphStateSlotPreview"];
export type GraphPromptFieldPreview = components["schemas"]["GraphPromptFieldPreview"];
export type GraphPromptPreviewResponse = components["schemas"]["GraphPromptPreviewResponse"];
export type AILogMessage = components["schemas"]["AILogMessage"];
export type AILogRecord = components["schemas"]["AILogRecord"];
export type AILogListResponse = components["schemas"]["AILogListResponse"];

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
};

const client = createClient<paths>({
  baseUrl: API_URL,
  fetch: (request: Request) => fetch(new Request(request, { credentials: "include" })),
});

function extractErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("detail" in error && typeof error.detail === "string") {
    return error.detail;
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  return null;
}

async function unwrap<T>(promise: Promise<OpenApiResult<T>>, fallbackMessage: string): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(extractErrorMessage(error) ?? fallbackMessage);
  }
  if (data === undefined) {
    throw new Error(fallbackMessage);
  }
  return data;
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return unwrap(client.GET("/api/health", { signal }), "加载运行状态失败。");
}

export async function getAuthSession(signal?: AbortSignal): Promise<AuthSessionResponse> {
  return unwrap(client.GET("/api/auth/session", { signal }), "加载登录状态失败。");
}

export async function login(body: AuthLoginRequest): Promise<AuthSessionResponse> {
  return unwrap(client.POST("/api/auth/login", { body }), "登录失败。");
}

export async function logout(): Promise<AuthSessionResponse> {
  return unwrap(client.POST("/api/auth/logout"), "退出登录失败。");
}

export async function listConversations(signal?: AbortSignal): Promise<ConversationListResponse> {
  return unwrap(client.GET("/api/conversations", { signal }), "加载对话列表失败。");
}

export async function getConversation(
  conversationId: number,
  signal?: AbortSignal,
): Promise<ConversationDetailResponse> {
  return unwrap(
    client.GET("/api/conversations/{conversation_id}", {
      params: { path: { conversation_id: conversationId } },
      signal,
    }),
    "加载对话失败。",
  );
}

export async function createConversation(body: ConversationCreateRequest): Promise<ConversationRecord> {
  return unwrap(client.POST("/api/conversations", { body }), "创建对话失败。");
}

export async function updateConversation(
  conversationId: number,
  body: ConversationUpdateRequest,
): Promise<ConversationRecord> {
  return unwrap(
    client.PATCH("/api/conversations/{conversation_id}", {
      params: { path: { conversation_id: conversationId } },
      body,
    }),
    "更新对话失败。",
  );
}

export async function deleteConversation(conversationId: number): Promise<void> {
  const { error } = await client.DELETE("/api/conversations/{conversation_id}", {
    params: { path: { conversation_id: conversationId } },
  });
  if (error) {
    throw new Error(extractErrorMessage(error) ?? "删除对话失败。");
  }
}

export async function listLikedCards(
  filters: {
    conversation_id?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<LikedCardListResponse> {
  return unwrap(
    client.GET("/api/liked-cards", {
      params: { query: filters },
      signal,
    }),
    "加载好卡片失败。",
  );
}

export async function createLikedCard(body: LikedCardCreateRequest): Promise<LikedCardRecord> {
  return unwrap(client.POST("/api/liked-cards", { body }), "点赞卡片失败。");
}

export async function deleteLikedCard(likedCardId: number): Promise<void> {
  const { error } = await client.DELETE("/api/liked-cards/{liked_card_id}", {
    params: { path: { liked_card_id: likedCardId } },
  });
  if (error) {
    throw new Error(extractErrorMessage(error) ?? "取消点赞失败。");
  }
}

export async function listLLMConfigs(signal?: AbortSignal): Promise<LLMConfigListResponse> {
  return unwrap(client.GET("/api/llm-configs", { signal }), "加载模型配置失败。");
}

export async function createLLMConfig(body: LLMConfigCreateRequest): Promise<LLMConfigRecord> {
  return unwrap(client.POST("/api/llm-configs", { body }), "创建模型配置失败。");
}

export async function updateLLMConfig(
  configId: number,
  body: LLMConfigUpdateRequest,
): Promise<LLMConfigRecord> {
  return unwrap(
    client.PUT("/api/llm-configs/{config_id}", {
      params: { path: { config_id: configId } },
      body,
    }),
    "更新模型配置失败。",
  );
}

export async function activateLLMConfig(configId: number): Promise<LLMConfigRecord> {
  return unwrap(
    client.POST("/api/llm-configs/{config_id}/activate", {
      params: { path: { config_id: configId } },
    }),
    "启用模型配置失败。",
  );
}

export async function deleteLLMConfig(configId: number): Promise<void> {
  const { error } = await client.DELETE("/api/llm-configs/{config_id}", {
    params: { path: { config_id: configId } },
  });
  if (error) {
    throw new Error(extractErrorMessage(error) ?? "删除模型配置失败。");
  }
}

export async function testLLMConfig(body: LLMConfigTestRequest): Promise<LLMConfigTestResponse> {
  return unwrap(client.POST("/api/llm-configs/test", { body }), "测试模型配置失败。");
}

export async function listGraphConfigs(signal?: AbortSignal): Promise<GraphConfigListResponse> {
  return unwrap(client.GET("/api/graph-configs", { signal }), "加载工作流配置失败。");
}

export async function createGraphConfig(body: GraphConfigCreateRequest): Promise<GraphConfigRecord> {
  return unwrap(client.POST("/api/graph-configs", { body }), "创建工作流配置失败。");
}

export async function previewGraphConfig(
  body: GraphPromptPreviewRequest,
  signal?: AbortSignal,
): Promise<GraphPromptPreviewResponse> {
  return unwrap(client.POST("/api/graph-configs/preview", { body, signal }), "加载工作流预览失败。");
}

export async function updateGraphConfig(
  configId: number,
  body: GraphConfigUpdateRequest,
): Promise<GraphConfigRecord> {
  return unwrap(
    client.PUT("/api/graph-configs/{config_id}", {
      params: { path: { config_id: configId } },
      body,
    }),
    "更新工作流配置失败。",
  );
}

export async function activateGraphConfig(configId: number): Promise<GraphConfigRecord> {
  return unwrap(
    client.POST("/api/graph-configs/{config_id}/activate", {
      params: { path: { config_id: configId } },
    }),
    "启用工作流配置失败。",
  );
}

export async function deleteGraphConfig(configId: number): Promise<void> {
  const { error } = await client.DELETE("/api/graph-configs/{config_id}", {
    params: { path: { config_id: configId } },
  });
  if (error) {
    throw new Error(extractErrorMessage(error) ?? "删除工作流配置失败。");
  }
}

export async function listAILogs(
  filters: {
    conversation_id?: number;
    request_id?: string;
    status?: AILogStatus;
    node_name?: string;
    graph_config_id?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<AILogListResponse> {
  return unwrap(
    client.GET("/api/ai-logs", {
      params: { query: filters },
      signal,
    }),
    "加载 AI 日志失败。",
  );
}
