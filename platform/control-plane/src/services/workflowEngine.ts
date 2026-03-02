export interface WorkflowStage {
  id: string;
  type: string;
  next?: string;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  version?: string;
  name?: string;
  stages: WorkflowStage[];
}

export interface WorkflowRuntimeContext {
  endUserId?: string;
  extractions: Record<string, unknown>;
  memory: Record<string, unknown>;
  metadata: Record<string, string>;
}

export class WorkflowInterpreter {
  private stageMap = new Map<string, WorkflowStage>();

  constructor(private readonly definition: WorkflowDefinition) {
    for (const stage of definition.stages ?? []) {
      this.stageMap.set(stage.id, stage);
    }
  }

  async run(context: WorkflowRuntimeContext): Promise<Array<Record<string, unknown>>> {
    const results: Array<Record<string, unknown>> = [];
    let current: WorkflowStage | undefined = this.definition.stages?.[0];
    while (current) {
      results.push({
        stageId: current.id,
        stageType: current.type,
      });
      if (current.type === "extraction") {
        context.extractions[current.id] = {
          completionScore: 0,
          fields: {},
        };
      }
      if (current.type === "end") {
        break;
      }
      current = current.next ? this.stageMap.get(current.next) : undefined;
    }
    return results;
  }
}
