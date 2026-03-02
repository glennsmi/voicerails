import type {WorkflowRuntimeContext, WorkflowStage} from "./types.js";

export interface StageExecutionResult {
  outputs?: Record<string, unknown>;
  nextStageId?: string;
  done: boolean;
}

export type StageHandler = (
  stage: WorkflowStage,
  context: WorkflowRuntimeContext,
) => Promise<StageExecutionResult>;

export const stageHandlers: Record<string, StageHandler> = {
  greeting: async (stage) => ({done: false, nextStageId: stage.next}),
  conversation: async (stage) => ({done: false, nextStageId: stage.next}),
  extraction: async (stage, context) => {
    const schema = (stage.schema ?? {}) as Record<string, unknown>;
    context.extractions[stage.id] = {
      schema,
      completionScore: 0,
      fields: {},
    };
    return {done: false, nextStageId: stage.next};
  },
  condition: async (stage, context) => {
    const expression = String(stage.expression ?? "");
    const passes = evaluateCondition(expression, context);
    return {
      done: false,
      nextStageId: passes ? String(stage.ifTrue ?? stage.next ?? "") : String(stage.ifFalse ?? stage.next ?? ""),
      outputs: {expression, passes},
    };
  },
  action: async (stage) => {
    return {
      done: false,
      nextStageId: String(stage.onSuccess ?? stage.next ?? ""),
      outputs: {status: "queued", action: stage.id},
    };
  },
  memory_read: async (stage, context) => {
    const key = String(stage.key ?? "");
    return {
      done: false,
      nextStageId: stage.next,
      outputs: {key, value: context.memory[key]},
    };
  },
  memory_write: async (stage, context) => {
    const key = String(stage.key ?? "");
    context.memory[key] = stage.value ?? null;
    return {
      done: false,
      nextStageId: stage.next,
      outputs: {key, value: context.memory[key]},
    };
  },
  handoff: async (stage) => ({
    done: false,
    nextStageId: stage.next,
    outputs: {transferTo: stage.transferTo ?? null},
  }),
  end: async () => ({done: true}),
};

function evaluateCondition(expression: string, context: WorkflowRuntimeContext): boolean {
  if (!expression.trim()) {
    return false;
  }
  const lowered = expression.toLowerCase();
  if (lowered.includes("true")) return true;
  if (lowered.includes("false")) return false;
  if (lowered.includes("extractions.")) {
    return Object.keys(context.extractions).length > 0;
  }
  return false;
}
