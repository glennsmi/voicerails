import type { HttpClient } from "./http.js";
export declare class AnalyticsApi {
    private readonly http;
    constructor(http: HttpClient);
    usage(input: {
        from: string;
        to: string;
        groupBy?: "day" | "week" | "month";
    }): Promise<Record<string, unknown>>;
    providerPerformance(input: {
        from: string;
        to: string;
        provider?: string;
    }): Promise<Record<string, unknown>>;
}
