export class TelephonyApi {
    http;
    constructor(http) {
        this.http = http;
    }
    numbers = {
        search: async (input) => this.http.post("/v1/telephony/numbers/search", input),
        provision: async (input) => this.http.post("/v1/telephony/numbers/provision", input),
        assign: async (numberId, input) => this.http.post(`/v1/telephony/numbers/${numberId}/assign`, input),
        release: async (numberId) => this.http.post(`/v1/telephony/numbers/${numberId}/release`, {}),
        list: async () => this.http.get("/v1/telephony/numbers"),
    };
}
//# sourceMappingURL=telephony.js.map