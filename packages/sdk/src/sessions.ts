import {VoiceConnectionClient, resolveExperienceControls, type VoiceConnectionConfig} from "@voicerails/connection-layer";
import type {HttpClient} from "./http.js";
import type {SessionCreateInput, SessionRecord} from "./types.js";

interface SessionCreateResponse extends SessionRecord {
  token: string;
  expiresAt: number;
}

export class SessionsApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: SessionCreateInput): Promise<SdkSession> {
    const result = await this.http.post<SessionCreateResponse>("/v1/sessions", input);
    return new SdkSession(this.http, result, input);
  }

  async list(): Promise<SessionRecord[]> {
    return this.http.get<SessionRecord[]>("/v1/sessions");
  }

  async get(sessionId: string): Promise<SessionRecord> {
    return this.http.get<SessionRecord>(`/v1/sessions/${sessionId}`);
  }
}

export class SdkSession {
  readonly id: string;
  readonly provider;
  readonly model;
  readonly voice;
  readonly token;
  readonly expiresAt;

  constructor(
    private readonly http: HttpClient,
    result: SessionCreateResponse,
    private readonly sourceInput: SessionCreateInput,
  ) {
    this.id = result.id;
    this.provider = result.provider;
    this.model = result.model;
    this.voice = result.voice;
    this.token = result.token;
    this.expiresAt = result.expiresAt;
  }

  async connect(): Promise<VoiceConnectionClient> {
    const connection = new VoiceConnectionClient();
    const config: VoiceConnectionConfig = {
      provider: this.provider,
      token: this.token,
      model: this.model,
      voice: this.voice,
      systemPrompt: this.sourceInput.systemPrompt,
      tools: this.sourceInput.tools ?? [],
      experienceControls: resolveExperienceControls(
        typeof this.sourceInput.experienceControls === "string"
          ? undefined
          : this.sourceInput.experienceControls,
      ),
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

  async finalize(payload?: Record<string, unknown>): Promise<void> {
    await this.http.post(`/v1/sessions/${this.id}/finalize`, payload ?? {});
  }
}
