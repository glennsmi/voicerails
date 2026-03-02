import type { HttpClient } from "./http.js";
export interface NumberRecord {
    id: string;
    e164: string;
    countryCode: string;
    numberType: string;
    capabilities: string[];
    lifecycleStatus: string;
}
export declare class TelephonyApi {
    private readonly http;
    constructor(http: HttpClient);
    readonly numbers: {
        search: (input: Record<string, unknown>) => Promise<NumberRecord[]>;
        provision: (input: Record<string, unknown>) => Promise<NumberRecord>;
        assign: (numberId: string, input: Record<string, unknown>) => Promise<{
            ok: true;
        }>;
        release: (numberId: string) => Promise<{
            ok: true;
        }>;
        list: () => Promise<NumberRecord[]>;
    };
}
