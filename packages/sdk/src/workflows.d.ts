import type { HttpClient } from "./http.js";
import type { WorkflowDefinition } from "./types.js";
export interface WorkflowRecord {
    id: string;
    name: string;
    definition: WorkflowDefinition;
    currentVersionId?: string;
}
export declare class WorkflowsApi {
    private readonly http;
    constructor(http: HttpClient);
    create(input: {
        name: string;
        definition: WorkflowDefinition;
    }): Promise<WorkflowRecord>;
    update(workflowId: string, input: {
        definition: WorkflowDefinition;
    }): Promise<WorkflowRecord>;
    list(): Promise<WorkflowRecord[]>;
    get(workflowId: string): Promise<WorkflowRecord>;
    deploy(workflowId: string, input: {
        environment: "production" | "staging" | "development";
        version?: string;
    }): Promise<{
        ok: true;
    }>;
}
