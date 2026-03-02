import type {HttpClient} from "./http.js";
import type {WorkflowDefinition} from "./types.js";

export interface WorkflowRecord {
  id: string;
  name: string;
  definition: WorkflowDefinition;
  currentVersionId?: string;
}

export class WorkflowsApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: {name: string; definition: WorkflowDefinition}): Promise<WorkflowRecord> {
    return this.http.post<WorkflowRecord>("/v1/workflows", input);
  }

  async update(workflowId: string, input: {definition: WorkflowDefinition}): Promise<WorkflowRecord> {
    return this.http.put<WorkflowRecord>(`/v1/workflows/${workflowId}`, input);
  }

  async list(): Promise<WorkflowRecord[]> {
    return this.http.get<WorkflowRecord[]>("/v1/workflows");
  }

  async get(workflowId: string): Promise<WorkflowRecord> {
    return this.http.get<WorkflowRecord>(`/v1/workflows/${workflowId}`);
  }

  async deploy(
    workflowId: string,
    input: {environment: "production" | "staging" | "development"; version?: string},
  ): Promise<{ok: true}> {
    return this.http.post<{ok: true}>(`/v1/workflows/${workflowId}/deploy`, input);
  }
}
