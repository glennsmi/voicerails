import type {WorkflowDefinition, WorkflowRuntimeContext, WorkflowStage} from "./types.js";
import {stageHandlers} from "./stages.js";

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
    let current: WorkflowStage | undefined = this.definition.stages[0];
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
    const handler = stageHandlers[stage.type];
    if (!handler) {
      return {stageId: stage.id, stageType: "unknown", done: true};
    }
    const result = await handler(stage, context);
    return {
      stageId: stage.id,
      stageType: stage.type,
      outputs: result.outputs,
      done: result.done,
      nextStageId: result.nextStageId,
    };
  }
}
