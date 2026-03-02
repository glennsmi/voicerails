import {resolveExperienceControls, VoiceConnectionClient, type ToolDeclaration} from "@voicerails/connection-layer";

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

export async function createBridgeConnection(config: BridgeSessionConfig): Promise<VoiceConnectionClient> {
  const connection = new VoiceConnectionClient();
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
  return connection;
}
