import type {HttpClient} from "./http.js";

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  secretPreview: string;
  status: "active" | "disabled";
}

export class WebhooksApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: {url: string; events: string[]; secret?: string; environment?: string}): Promise<WebhookRecord> {
    return this.http.post<WebhookRecord>("/v1/webhooks", input);
  }

  async list(): Promise<WebhookRecord[]> {
    return this.http.get<WebhookRecord[]>("/v1/webhooks");
  }

  async delete(id: string): Promise<{ok: true}> {
    return this.http.delete<{ok: true}>(`/v1/webhooks/${id}`);
  }
}
