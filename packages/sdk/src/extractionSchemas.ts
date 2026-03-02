import type {HttpClient} from "./http.js";

export interface ExtractionSchemaRecord {
  id: string;
  name: string;
  outcomes: Array<{
    field: string;
    required?: boolean;
    type?: string;
    description?: string;
  }>;
  completionThreshold?: number;
  conversationStyle?: string;
}

export class ExtractionSchemasApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: Omit<ExtractionSchemaRecord, "id">): Promise<ExtractionSchemaRecord> {
    return this.http.post<ExtractionSchemaRecord>("/v1/extraction/schemas", input);
  }

  async list(): Promise<ExtractionSchemaRecord[]> {
    return this.http.get<ExtractionSchemaRecord[]>("/v1/extraction/schemas");
  }

  async get(id: string): Promise<ExtractionSchemaRecord> {
    return this.http.get<ExtractionSchemaRecord>(`/v1/extraction/schemas/${id}`);
  }
}
