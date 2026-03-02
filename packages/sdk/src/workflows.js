export class WorkflowsApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async create(input) {
        return this.http.post("/v1/workflows", input);
    }
    async update(workflowId, input) {
        return this.http.put(`/v1/workflows/${workflowId}`, input);
    }
    async list() {
        return this.http.get("/v1/workflows");
    }
    async get(workflowId) {
        return this.http.get(`/v1/workflows/${workflowId}`);
    }
    async deploy(workflowId, input) {
        return this.http.post(`/v1/workflows/${workflowId}/deploy`, input);
    }
}
//# sourceMappingURL=workflows.js.map