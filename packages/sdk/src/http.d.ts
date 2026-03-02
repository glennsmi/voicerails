export declare class HttpClient {
    private readonly baseUrl;
    private readonly apiKey;
    constructor(baseUrl: string, apiKey: string);
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body: unknown): Promise<T>;
    put<T>(path: string, body: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
    private buildHeaders;
    private parse;
}
