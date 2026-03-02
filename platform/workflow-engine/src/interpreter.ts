import type {WorkflowDefinition, WorkflowRuntimeContext, WorkflowStage} from "./types.js";

export interface WorkflowStepResult {
  stageId: string;
  stageType: string;
  outputs?: Record<string, unknown>;
  done: boolean;
  nextStageId?: string;
}

export class WorkflowInterpreter {
  private stageMap = new Map<string, WorkflowStage>();

  constructor(private readonly definition: WorkflowDefinition) {
    for (const stage of definition.stages) {
      this.stageMap.set(stage.id, stage);
    }
  }

  async run(context: WorkflowRuntimeContext): Promise<WorkflowStepResult[]> {
    const results: WorkflowStepResult[] = [];
    let current = this.definition.stages[0];
    while (current) {
      const step = await this.executeStage(current, context);
      results.push(step);
      if (step.done || !step.nextStageId) {
        break;
      }
      current = this.stageMap.get(step.nextStageId);
    }
    return results;
  }

  private async executeStage(
    stage: WorkflowStage,
    context: WorkflowRuntimeContext,
  ): Promise<WorkflowStepResult> {
    switch (stage.type) {
      case "greeting":
      case "conversation":
        return {stageId: stage.id, stageType: stage.type, done: false, nextStageId: stage.next};
      case "extraction":
        context.extractions[stage.id] = {
          completionScore: 0,
          fields: {},
        };
        return {stageId: stage.id, stageType: stage.type, done: false, nextStageId: stage.next};
      case "memory_read":
      case "memory_write":
      case "action":
      case "condition":
      case "handoff":
        return {stageId: stage.id, stageType: stage.type, done: false, nextStageId: stage.next};
      case "end":
        return {stageId: stage.id, stageType: stage.type, done: true};
      default:
        return {stageId: stage.id, stageType: "unknown", done: true};
    }
  }
}
