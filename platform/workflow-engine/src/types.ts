export type WorkflowStageType =
  | "greeting"
  | "conversation"
  | "extraction"
  | "condition"
  | "action"
  | "memory_read"
  | "memory_write"
  | "handoff"
  | "end";

export interface WorkflowStage {
  id: string;
  type: WorkflowStageType;
  next?: string;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  version: "1.0";
  name: string;
  description?: string;
  stages: WorkflowStage[];
}

export interface WorkflowRuntimeContext {
  endUserId?: string;
  extractions: Record<string, unknown>;
  memory: Record<string, unknown>;
  metadata: Record<string, string>;
}
