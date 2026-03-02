import type {HttpClient} from "./http.js";

export interface NumberRecord {
  id: string;
  e164: string;
  countryCode: string;
  numberType: string;
  capabilities: string[];
  lifecycleStatus: string;
}

export class TelephonyApi {
  constructor(private readonly http: HttpClient) {}

  readonly numbers = {
    search: async (input: Record<string, unknown>): Promise<NumberRecord[]> =>
      this.http.post<NumberRecord[]>("/v1/telephony/numbers/search", input),
    provision: async (input: Record<string, unknown>): Promise<NumberRecord> =>
      this.http.post<NumberRecord>("/v1/telephony/numbers/provision", input),
    assign: async (numberId: string, input: Record<string, unknown>): Promise<{ok: true}> =>
      this.http.post<{ok: true}>(`/v1/telephony/numbers/${numberId}/assign`, input),
    release: async (numberId: string): Promise<{ok: true}> =>
      this.http.post<{ok: true}>(`/v1/telephony/numbers/${numberId}/release`, {}),
    list: async (): Promise<NumberRecord[]> => this.http.get<NumberRecord[]>("/v1/telephony/numbers"),
  };
}
