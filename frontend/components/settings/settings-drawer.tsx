"use client";

import { Network, PanelRightClose, ScrollText, Settings2 } from "lucide-react";

import { AILogsPanel } from "@/components/settings/ai-logs-panel";
import { GraphConfigPanel } from "@/components/settings/graph-config-panel";
import { ModelConfigPanel } from "@/components/settings/model-config-panel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  GraphConfigCreateRequest,
  GraphConfigRecord,
  GraphConfigUpdateRequest,
  HealthResponse,
  LLMConfigCreateRequest,
  LLMConfigRecord,
  LLMConfigTestRequest,
  LLMConfigTestResponse,
  LLMConfigUpdateRequest,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";

type SettingsSection = "model" | "graph" | "logs";

type SettingsDrawerProps = {
  isOpen: boolean;
  section: SettingsSection;
  onClose: () => void;
  onSectionChange: (section: SettingsSection) => void;
  runtimeStatus: HealthResponse | null;
  modelConfigs: LLMConfigRecord[];
  activeModelConfigId: number | null;
  isModelLoading: boolean;
  isModelSaving: boolean;
  isModelTesting: boolean;
  modelActivatingId: number | null;
  onCreateModelConfig: (payload: LLMConfigCreateRequest) => Promise<LLMConfigRecord>;
  onUpdateModelConfig: (args: {
    configId: number;
    payload: LLMConfigUpdateRequest;
  }) => Promise<LLMConfigRecord>;
  onActivateModelConfig: (configId: number) => Promise<LLMConfigRecord>;
  onDeleteModelConfig: (configId: number) => Promise<void>;
  onTestModelConfig: (payload: LLMConfigTestRequest) => Promise<LLMConfigTestResponse>;
  graphConfigs: GraphConfigRecord[];
  activeGraphConfigId: number | null;
  activeConversationId: number | null;
  activeConversationTitle: string | null;
  isGraphLoading: boolean;
  isGraphSaving: boolean;
  graphActivatingId: number | null;
  onCreateGraphConfig: (payload: GraphConfigCreateRequest) => Promise<GraphConfigRecord>;
  onUpdateGraphConfig: (args: {
    configId: number;
    payload: GraphConfigUpdateRequest;
  }) => Promise<GraphConfigRecord>;
  onActivateGraphConfig: (configId: number) => Promise<GraphConfigRecord>;
  onDeleteGraphConfig: (configId: number) => Promise<void>;
};

export function SettingsDrawer({
  isOpen,
  section,
  onClose,
  onSectionChange,
  runtimeStatus,
  modelConfigs,
  activeModelConfigId,
  isModelLoading,
  isModelSaving,
  isModelTesting,
  modelActivatingId,
  onCreateModelConfig,
  onUpdateModelConfig,
  onActivateModelConfig,
  onDeleteModelConfig,
  onTestModelConfig,
  graphConfigs,
  activeGraphConfigId,
  activeConversationId,
  activeConversationTitle,
  isGraphLoading,
  isGraphSaving,
  graphActivatingId,
  onCreateGraphConfig,
  onUpdateGraphConfig,
  onActivateGraphConfig,
  onDeleteGraphConfig,
}: SettingsDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex bg-slate-950/30 backdrop-blur-[2px]">
      <button type="button" className="flex-1" aria-label="关闭设置" onClick={onClose} />
      <div className="h-full w-full max-w-5xl border-l border-slate-200 bg-white shadow-2xl">
        <div className="grid h-full min-h-0 md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-5 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-xl font-semibold text-slate-950">设置</div>
                <div className="mt-1 text-sm text-slate-500">以后可以继续扩展更多配置项</div>
              </div>
              <Button type="button" size="icon" variant="secondary" onClick={onClose}>
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors",
                  section === "model"
                    ? "bg-slate-950 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => onSectionChange("model")}
              >
                <Settings2 className="h-4 w-4" />
                模型配置
              </button>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors",
                  section === "graph"
                    ? "bg-slate-950 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => onSectionChange("graph")}
              >
                <Network className="h-4 w-4" />
                工作流配置
              </button>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors",
                  section === "logs"
                    ? "bg-slate-950 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => onSectionChange("logs")}
              >
                <ScrollText className="h-4 w-4" />
                AI 日志
              </button>
            </div>
          </aside>

          <div className="min-h-0">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-5 sm:p-6">
                {section === "model" ? (
                  <ModelConfigPanel
                    runtimeStatus={runtimeStatus}
                    configs={modelConfigs}
                    activeConfigId={activeModelConfigId}
                    isLoading={isModelLoading}
                    isSaving={isModelSaving}
                    isTesting={isModelTesting}
                    activatingId={modelActivatingId}
                    onCreateConfig={onCreateModelConfig}
                    onUpdateConfig={onUpdateModelConfig}
                    onActivateConfig={onActivateModelConfig}
                    onDeleteConfig={onDeleteModelConfig}
                    onTestConfig={onTestModelConfig}
                  />
                ) : section === "graph" ? (
                  <GraphConfigPanel
                    configs={graphConfigs}
                    activeConfigId={activeGraphConfigId}
                    isLoading={isGraphLoading}
                    isSaving={isGraphSaving}
                    activatingId={graphActivatingId}
                    onCreateConfig={onCreateGraphConfig}
                    onUpdateConfig={onUpdateGraphConfig}
                    onActivateConfig={onActivateGraphConfig}
                    onDeleteConfig={onDeleteGraphConfig}
                  />
                ) : (
                  <AILogsPanel
                    activeConversationId={activeConversationId}
                    activeConversationTitle={activeConversationTitle}
                    graphConfigs={graphConfigs}
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
