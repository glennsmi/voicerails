import type {HttpClient} from "./http.js";

export class MemoryApi {
  constructor(private readonly http: HttpClient) {}

  async set(input: {
    endUserId: string;
    scope: "session" | "user" | "app";
    key: string;
    value: unknown;
  }): Promise<{ok: true}> {
    return this.http.post<{ok: true}>("/v1/memory/set", input);
  }

  async get(input: {
    endUserId: string;
    scope: "session" | "user" | "app";
    key: string;
  }): Promise<{value: unknown | null}> {
    return this.http.post<{value: unknown | null}>("/v1/memory/get", input);
  }
}
