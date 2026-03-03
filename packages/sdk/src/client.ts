import {HttpClient} from "./http.js";
import {SessionsApi} from "./sessions.js";
import {CallsApi} from "./calls.js";
import {TelephonyApi} from "./telephony.js";
import {WorkflowsApi} from "./workflows.js";
import {AnalyticsApi} from "./analytics.js";
import {WebhooksApi} from "./webhooks.js";
import {MemoryApi} from "./memory.js";
import {ExtractionSchemasApi} from "./extractionSchemas.js";
import {ConnectorsApi} from "./connectors.js";
import type {VoiceRailsClientOptions} from "./types.js";

export class VoiceRails {
  readonly sessions: SessionsApi;
  readonly calls: CallsApi;
  readonly telephony: TelephonyApi;
  readonly workflows: WorkflowsApi;
  readonly analytics: AnalyticsApi;
  readonly webhooks: WebhooksApi;
  readonly memory: MemoryApi;
  readonly extractionSchemas: ExtractionSchemasApi;
  readonly connectors: ConnectorsApi;

  constructor(options: VoiceRailsClientOptions) {
    const envBaseUrl =
      typeof process !== "undefined" &&
      typeof process.env !== "undefined" &&
      process.env.VOICERAILS_API_BASE_URL
        ? process.env.VOICERAILS_API_BASE_URL
        : undefined;
    const baseUrl =
      options.baseUrl ??
      envBaseUrl ??
      "http://localhost:5001/voicerails8/europe-west2/api";
    const http = new HttpClient(baseUrl, options.apiKey);
    this.sessions = new SessionsApi(http);
    this.calls = new CallsApi(http);
    this.telephony = new TelephonyApi(http);
    this.workflows = new WorkflowsApi(http);
    this.analytics = new AnalyticsApi(http);
    this.webhooks = new WebhooksApi(http);
    this.memory = new MemoryApi(http);
    this.extractionSchemas = new ExtractionSchemasApi(http);
    this.connectors = new ConnectorsApi(http);
  }
}
