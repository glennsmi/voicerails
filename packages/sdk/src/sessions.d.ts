import { VoiceConnectionClient } from "@voicerails/connection-layer";
import type { HttpClient } from "./http.js";
import type { SessionCreateInput, SessionRecord } from "./types.js";
interface SessionCreateResponse extends SessionRecord {
    token: string;
    expiresAt: number;
}
export declare class SessionsApi {
    private readonly http;
    constructor(http: HttpClient);
    create(input: SessionCreateInput): Promise<SdkSession>;
    list(): Promise<SessionRecord[]>;
    get(sessionId: string): Promise<SessionRecord>;
}
export declare class SdkSession {
    private readonly http;
    private readonly sourceInput;
    readonly id: string;
    readonly provider: import("@voicerails/connection-layer").VoiceProvider;
    readonly model: string;
    readonly voice: string;
    readonly token: string;
    readonly expiresAt: number;
    constructor(http: HttpClient, result: SessionCreateResponse, sourceInput: SessionCreateInput);
    connect(): Promise<VoiceConnectionClient>;
    finalize(payload?: Record<string, unknown>): Promise<void>;
}
export {};
