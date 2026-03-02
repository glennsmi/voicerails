export class CallsApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async create(input) {
        return this.http.post("/v1/calls", input);
    }
    async get(callId) {
        return this.http.get(`/v1/calls/${callId}`);
    }
    async list() {
        return this.http.get("/v1/calls");
    }
}
//# sourceMappingURL=calls.js.map