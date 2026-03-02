import type { HttpClient } from "./http.js";
export interface WebhookRecord {
    id: string;
    url: string;
    events: string[];
    secretPreview: string;
    status: "active" | "disabled";
}
export declare class WebhooksApi {
    private readonly http;
    constructor(http: HttpClient);
    create(input: {
        url: string;
        events: string[];
        secret?: string;
        environment?: string;
    }): Promise<WebhookRecord>;
    list(): Promise<WebhookRecord[]>;
    delete(id: string): Promise<{
        ok: true;
    }>;
}
