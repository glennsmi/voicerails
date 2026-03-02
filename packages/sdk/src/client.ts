import {HttpClient} from "./http.js";
import {SessionsApi} from "./sessions.js";
import {CallsApi} from "./calls.js";
import {TelephonyApi} from "./telephony.js";
import {WorkflowsApi} from "./workflows.js";
import {AnalyticsApi} from "./analytics.js";
import {WebhooksApi} from "./webhooks.js";
import {MemoryApi} from "./memory.js";
import type {VoiceRailsClientOptions} from "./types.js";

export class VoiceRails {
  readonly sessions: SessionsApi;
  readonly calls: CallsApi;
  readonly telephony: TelephonyApi;
  readonly workflows: WorkflowsApi;
  readonly analytics: AnalyticsApi;
  readonly webhooks: WebhooksApi;
  readonly memory: MemoryApi;

  constructor(options: VoiceRailsClientOptions) {
    const baseUrl =
      options.baseUrl ??
      process.env.VOICERAILS_API_BASE_URL ??
      "http://localhost:5001/voicerails8/europe-west2/api";
    const http = new HttpClient(baseUrl, options.apiKey);
    this.sessions = new SessionsApi(http);
    this.calls = new CallsApi(http);
    this.telephony = new TelephonyApi(http);
    this.workflows = new WorkflowsApi(http);
    this.analytics = new AnalyticsApi(http);
    this.webhooks = new WebhooksApi(http);
    this.memory = new MemoryApi(http);
  }
}
