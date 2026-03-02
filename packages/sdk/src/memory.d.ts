import type { HttpClient } from "./http.js";
export declare class MemoryApi {
    private readonly http;
    constructor(http: HttpClient);
    set(input: {
        endUserId: string;
        scope: "session" | "user" | "app";
        key: string;
        value: unknown;
    }): Promise<{
        ok: true;
    }>;
    get(input: {
        endUserId: string;
        scope: "session" | "user" | "app";
        key: string;
    }): Promise<{
        value: unknown | null;
    }>;
}
