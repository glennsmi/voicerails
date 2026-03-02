export class AnalyticsApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async usage(input) {
        const query = new URLSearchParams({
            from: input.from,
            to: input.to,
            ...(input.groupBy ? { groupBy: input.groupBy } : {}),
        });
        return this.http.get(`/v1/analytics/usage?${query.toString()}`);
    }
    async providerPerformance(input) {
        const query = new URLSearchParams({
            from: input.from,
            to: input.to,
            ...(input.provider ? { provider: input.provider } : {}),
        });
        return this.http.get(`/v1/analytics/providers?${query.toString()}`);
    }
}
//# sourceMappingURL=analytics.js.map