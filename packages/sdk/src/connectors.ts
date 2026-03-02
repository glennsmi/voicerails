import type {HttpClient} from "./http.js";

export interface ConnectorRecord {
  id: string;
  name: string;
  type: "webhook" | "database" | "queue";
  endpoint: string;
  status: "active" | "suspended" | "error";
}

export class ConnectorsApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: Record<string, unknown>): Promise<ConnectorRecord> {
    return this.http.post<ConnectorRecord>("/v1/connectors", input);
  }

  async list(): Promise<ConnectorRecord[]> {
    return this.http.get<ConnectorRecord[]>("/v1/connectors");
  }

  async invoke(
    id: string,
    input: {method?: "POST" | "GET" | "PUT" | "DELETE"; payload?: Record<string, unknown>},
  ): Promise<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`/v1/connectors/${id}/invoke`, input);
  }
}
