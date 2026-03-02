import { SessionsApi } from "./sessions.js";
import { CallsApi } from "./calls.js";
import { TelephonyApi } from "./telephony.js";
import { WorkflowsApi } from "./workflows.js";
import { AnalyticsApi } from "./analytics.js";
import { WebhooksApi } from "./webhooks.js";
import { MemoryApi } from "./memory.js";
import type { VoiceRailsClientOptions } from "./types.js";
export declare class VoiceRails {
    readonly sessions: SessionsApi;
    readonly calls: CallsApi;
    readonly telephony: TelephonyApi;
    readonly workflows: WorkflowsApi;
    readonly analytics: AnalyticsApi;
    readonly webhooks: WebhooksApi;
    readonly memory: MemoryApi;
    constructor(options: VoiceRailsClientOptions);
}
