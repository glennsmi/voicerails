export class MemoryApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async set(input) {
        return this.http.post("/v1/memory/set", input);
    }
    async get(input) {
        return this.http.post("/v1/memory/get", input);
    }
}
//# sourceMappingURL=memory.js.map