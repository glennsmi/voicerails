import {
  VoiceConnectionClient,
  resolveExperienceControls,
  type ToolDeclaration,
  type VoiceProvider,
} from "@voicerails/connection-layer";

type BridgeEventMap = {
  assistant_audio: (data: {audioBase64: string; sampleRate: number}) => void;
  user_transcript: (data: {text: string; streamKey: string; isFinal: boolean}) => void;
  assistant_transcript: (data: {text: string; streamKey: string; isFinal: boolean}) => void;
  tool_call: (data: {callId: string; name: string; args: Record<string, unknown>}) => void;
  error: (data: {code: string; message: string; recoverable: boolean}) => void;
  disconnected: (data: {reason: string; intentional: boolean}) => void;
};

export interface BridgeConnection {
  sendAudio(base64Audio: string): void;
  respondToToolCall(callId: string, output: string): void;
  disconnect(): void;
  on<E extends keyof BridgeEventMap>(event: E, handler: BridgeEventMap[E]): void;
}

export interface BridgeSessionConfig {
  id: string;
  token: string;
  provider: VoiceProvider;
  model: string;
  voice: string;
  systemPrompt: string;
  tools: ToolDeclaration[];
}

export async function fetchBridgeSessionConfig(payload: Record<string, unknown>): Promise<BridgeSessionConfig> {
  const baseUrl = process.env.VOICERAILS_API_BASE_URL ??
    "http://localhost:5001/voicerails8/europe-west2/api";
  const apiKey = process.env.VOICERAILS_API_KEY ?? "vr_test_local";
  const response = await fetch(`${baseUrl}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      provider: payload.provider ?? "openai",
      voice: payload.voice ?? "alloy",
      model: payload.model ?? "gpt-realtime",
      channel: "telephony",
      systemPrompt: payload.systemPrompt ?? "You are a helpful voice assistant.",
      tools: payload.tools ?? [],
      metadata: payload.metadata ?? {},
      endUserId: payload.endUserId,
      workflowId: payload.workflowId,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch session config: ${response.status}`);
  }
  return response.json() as Promise<BridgeSessionConfig>;
}

export async function createBridgeConnection(config: BridgeSessionConfig): Promise<BridgeConnection> {
  const connection = new VoiceConnectionClient();
  const listeners: Partial<Record<keyof BridgeEventMap, Array<Function>>> = {};

  function emit<E extends keyof BridgeEventMap>(event: E, payload: Parameters<BridgeEventMap[E]>[0]) {
    for (const listener of listeners[event] ?? []) {
      (listener as any)(payload);
    }
  }

  connection.on("assistant_audio", (event) => emit("assistant_audio", event));
  connection.on("user_transcript", (event) => emit("user_transcript", event));
  connection.on("assistant_transcript", (event) => emit("assistant_transcript", event));
  connection.on("tool_call", (event) => emit("tool_call", event));
  connection.on("error", (event) => emit("error", event));
  connection.on("disconnected", (event) => emit("disconnected", event));

  await connection.connect({
    provider: config.provider,
    token: config.token,
    model: config.model,
    voice: config.voice,
    systemPrompt: config.systemPrompt,
    tools: config.tools,
    experienceControls: resolveExperienceControls(),
    audio: {
      inputSampleRate: 8000,
      outputSampleRate: 8000,
      inputFormat: "g711_ulaw",
      outputFormat: "g711_ulaw",
    },
  });

  return {
    sendAudio(base64Audio: string): void {
      if (!base64Audio) {
        return;
      }
      connection.sendAudio(base64Audio);
    },
    respondToToolCall(callId: string, output: string): void {
      connection.respondToToolCall(callId, output);
    },
    disconnect(): void {
      connection.disconnect();
    },
    on(event, handler): void {
      listeners[event] = listeners[event] ?? [];
      listeners[event]!.push(handler as any);
    },
  };
}

export async function finalizeBridgeSession(input: {
  sessionId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const baseUrl = process.env.VOICERAILS_API_BASE_URL ??
    "http://localhost:5001/voicerails8/europe-west2/api";
  const apiKey = process.env.VOICERAILS_API_KEY ?? "vr_test_local";
  const response = await fetch(`${baseUrl}/v1/sessions/${input.sessionId}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input.metadata),
  });
  if (!response.ok) {
    throw new Error(`Failed to finalize session ${input.sessionId}: ${response.status}`);
  }
}
