import createClient from "openapi-fetch";

import { API_URL } from "@/lib/api";

import type { components, paths } from "./generated";

export type GraphType = components["schemas"]["GraphType"];
export type HealthResponse = components["schemas"]["HealthResponse"];
export type ConversationSummary = components["schemas"]["ConversationSummary"];
export type ConversationRecord = components["schemas"]["ConversationRecord"];
export type ConversationMessageRecord = components["schemas"]["ConversationMessageRecord"];
export type ConversationDetailResponse = components["schemas"]["ConversationDetailResponse"];
export type ConversationListResponse = components["schemas"]["ConversationListResponse"];
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

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
};

const client = createClient<paths>({ baseUrl: API_URL });

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

export async function createConversation(): Promise<ConversationRecord> {
  return unwrap(client.POST("/api/conversations"), "创建对话失败。");
}

export async function deleteConversation(conversationId: number): Promise<void> {
  const { error } = await client.DELETE("/api/conversations/{conversation_id}", {
    params: { path: { conversation_id: conversationId } },
  });
  if (error) {
    throw new Error(extractErrorMessage(error) ?? "删除对话失败。");
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
