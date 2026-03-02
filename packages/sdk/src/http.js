export class HttpClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    async get(path) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: this.buildHeaders(),
        });
        return this.parse(response);
    }
    async post(path, body) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
        });
        return this.parse(response);
    }
    async put(path, body) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "PUT",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
        });
        return this.parse(response);
    }
    async delete(path) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "DELETE",
            headers: this.buildHeaders(),
        });
        return this.parse(response);
    }
    buildHeaders() {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
        };
    }
    async parse(response) {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = payload?.error?.message ?? `HTTP ${response.status}`;
            throw new Error(message);
        }
        return payload;
    }
}
//# sourceMappingURL=http.js.map