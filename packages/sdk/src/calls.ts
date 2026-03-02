import type {HttpClient} from "./http.js";
import type {CallCreateInput} from "./types.js";

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

export class CallsApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: CallCreateInput): Promise<CallRecord> {
    return this.http.post<CallRecord>("/v1/calls", input);
  }

  async get(callId: string): Promise<CallRecord> {
    return this.http.get<CallRecord>(`/v1/calls/${callId}`);
  }

  async list(): Promise<CallRecord[]> {
    return this.http.get<CallRecord[]>("/v1/calls");
  }
}
