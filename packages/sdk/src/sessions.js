import { VoiceConnectionClient, resolveExperienceControls } from "@voicerails/connection-layer";
export class SessionsApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async create(input) {
        const result = await this.http.post("/v1/sessions", input);
        return new SdkSession(this.http, result, input);
    }
    async list() {
        return this.http.get("/v1/sessions");
    }
    async get(sessionId) {
        return this.http.get(`/v1/sessions/${sessionId}`);
    }
}
export class SdkSession {
    http;
    sourceInput;
    id;
    provider;
    model;
    voice;
    token;
    expiresAt;
    constructor(http, result, sourceInput) {
        this.http = http;
        this.sourceInput = sourceInput;
        this.id = result.id;
        this.provider = result.provider;
        this.model = result.model;
        this.voice = result.voice;
        this.token = result.token;
        this.expiresAt = result.expiresAt;
    }
    async connect() {
        const connection = new VoiceConnectionClient();
        const config = {
            provider: this.provider,
            token: this.token,
            model: this.model,
            voice: this.voice,
            systemPrompt: this.sourceInput.systemPrompt,
            tools: this.sourceInput.tools ?? [],
            experienceControls: resolveExperienceControls(typeof this.sourceInput.experienceControls === "string"
                ? undefined
                : this.sourceInput.experienceControls),
            audio: {
                inputFormat: this.sourceInput.channel === "telephony" ? "g711_ulaw" : "pcm16",
                outputFormat: this.sourceInput.channel === "telephony" ? "g711_ulaw" : "pcm16",
                inputSampleRate: this.sourceInput.channel === "telephony" ? 8000 : 16000,
                outputSampleRate: this.sourceInput.channel === "telephony" ? 8000 : 24000,
            },
        };
        await connection.connect(config);
        return connection;
    }
    async finalize(payload) {
        await this.http.post(`/v1/sessions/${this.id}/finalize`, payload ?? {});
    }
}
//# sourceMappingURL=sessions.js.map