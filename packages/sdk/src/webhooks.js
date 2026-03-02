export class WebhooksApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async create(input) {
        return this.http.post("/v1/webhooks", input);
    }
    async list() {
        return this.http.get("/v1/webhooks");
    }
    async delete(id) {
        return this.http.delete(`/v1/webhooks/${id}`);
    }
}
//# sourceMappingURL=webhooks.js.map