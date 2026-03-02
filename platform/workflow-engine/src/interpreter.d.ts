import type { WorkflowDefinition, WorkflowRuntimeContext } from "./types.js";
export interface WorkflowStepResult {
    stageId: string;
    stageType: string;
    outputs?: Record<string, unknown>;
    done: boolean;
    nextStageId?: string;
}
export declare class WorkflowInterpreter {
    private readonly definition;
    private stageMap;
    constructor(definition: WorkflowDefinition);
    run(context: WorkflowRuntimeContext): Promise<WorkflowStepResult[]>;
    private executeStage;
}
