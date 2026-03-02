import type {HttpClient} from "./http.js";

export class AnalyticsApi {
  constructor(private readonly http: HttpClient) {}

  async usage(input: {from: string; to: string; groupBy?: "day" | "week" | "month"}): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({
      from: input.from,
      to: input.to,
      ...(input.groupBy ? {groupBy: input.groupBy} : {}),
    });
    return this.http.get(`/v1/analytics/usage?${query.toString()}`);
  }

  async providerPerformance(input: {
    from: string;
    to: string;
    provider?: string;
  }): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({
      from: input.from,
      to: input.to,
      ...(input.provider ? {provider: input.provider} : {}),
    });
    return this.http.get(`/v1/analytics/providers?${query.toString()}`);
  }
}
