type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type BridgeEventMap = {
  assistant_audio: (data: {audioBase64: string; sampleRate: number}) => void;
  user_transcript: (data: {text: string; streamKey: string; isFinal: boolean}) => void;
  assistant_transcript: (data: {text: string; streamKey: string; isFinal: boolean}) => void;
  tool_call: (data: {callId: string; name: string; args: Record<string, unknown>}) => void;
  error: (data: {code: string; message: string; recoverable: boolean}) => void;
};

export interface BridgeConnection {
  sendAudio(base64Audio: string): void;
  disconnect(): void;
  on<E extends keyof BridgeEventMap>(event: E, handler: BridgeEventMap[E]): void;
}

export interface BridgeSessionConfig {
  id: string;
  token: string;
  provider: "openai" | "gemini" | "elevenlabs" | "grok";
  model: string;
  voice: string;
  systemPrompt: string;
  tools: ToolDeclaration[];
}

export async function fetchBridgeSessionConfig(payload: Record<string, unknown>): Promise<BridgeSessionConfig> {
  const baseUrl = process.env.VOICERAILS_API_BASE_URL ??
    "http://localhost:5001/voicerails8/us-central1/api";
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

export async function createBridgeConnection(_config: BridgeSessionConfig): Promise<BridgeConnection> {
  const listeners: Partial<Record<keyof BridgeEventMap, Array<Function>>> = {};

  function emit<E extends keyof BridgeEventMap>(event: E, payload: Parameters<BridgeEventMap[E]>[0]) {
    for (const listener of listeners[event] ?? []) {
      (listener as any)(payload);
    }
  }

  // Self-contained mock bridge runtime for now; real provider sockets can be
  // plugged in later without changing server lifecycle code.
  return {
    sendAudio(base64Audio: string): void {
      if (!base64Audio) {
        return;
      }
      // Optional echo mode for local diagnostics.
      if (process.env.BRIDGE_ECHO_AUDIO === "true") {
        emit("assistant_audio", {
          audioBase64: base64Audio,
          sampleRate: 8000,
        });
      }
    },
    disconnect(): void {
      // no-op in mock runtime
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
    "http://localhost:5001/voicerails8/us-central1/api";
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
