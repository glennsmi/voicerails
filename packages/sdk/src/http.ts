export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.buildHeaders(),
    });
    return this.parse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    return this.parse<T>(response);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    return this.parse<T>(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.buildHeaders(),
    });
    return this.parse<T>(response);
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async parse<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (payload as any)?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }
}
