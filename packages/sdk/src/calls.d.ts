import type { HttpClient } from "./http.js";
import type { CallCreateInput } from "./types.js";
export interface CallRecord {
    id: string;
    sessionId: string;
    status: string;
    to: string;
    from: string;
    startedAt?: string;
    endedAt?: string;
    durationSeconds?: number;
}
export declare class CallsApi {
    private readonly http;
    constructor(http: HttpClient);
    create(input: CallCreateInput): Promise<CallRecord>;
    get(callId: string): Promise<CallRecord>;
    list(): Promise<CallRecord[]>;
}
