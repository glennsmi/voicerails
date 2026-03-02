import {randomUUID} from "node:crypto";
import type {VoiceProvider} from "@voicerails/connection-layer";
import {getSecretValue} from "./secretManager.js";

export interface ProviderSessionToken {
  token: string;
  model: string;
  voice: string;
  expiresAt: number;
}

export async function createProviderSessionToken(input: {
  provider: VoiceProvider;
  model: string;
  voice: string;
  systemPrompt: string;
  tools: unknown[];
  audio: {inputFormat: string; outputFormat: string};
}): Promise<ProviderSessionToken> {
  if (input.provider === "openai" || input.provider === "elevenlabs") {
    const key = await getSecretValue("OPENAI_API_KEY");
    if (key) {
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "OpenAI-Beta": "realtime=v1",
        },
        body: JSON.stringify({
          model: input.model,
          voice: input.provider === "elevenlabs" ? undefined : input.voice,
          instructions: input.systemPrompt,
          modalities: input.provider === "elevenlabs" ? ["text"] : ["audio", "text"],
          input_audio_format: input.audio.inputFormat,
          output_audio_format: input.audio.outputFormat,
          tools: input.tools,
        }),
      });
      const payload = (await response.json()) as any;
      const token = payload?.client_secret?.value;
      if (token) {
        return {
          token,
          model: input.model,
          voice: input.voice,
          expiresAt: Number(payload?.client_secret?.expires_at ?? Date.now() + 29 * 60 * 1000),
        };
      }
    }
  }

  if (input.provider === "gemini") {
    const apiKey = await getSecretValue("GEMINI_API_KEY");
    if (apiKey) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
          bidiGenerateContentSetup: {
            model: input.model,
            systemInstruction: {
              parts: [{text: input.systemPrompt}],
            },
          },
        }),
      });
      const payload = (await response.json()) as any;
      if (payload?.name) {
        return {
          token: payload.name,
          model: input.model,
          voice: input.voice,
          expiresAt: Date.now() + 29 * 60 * 1000,
        };
      }
    }
  }

  if (input.provider === "grok") {
    const apiKey = await getSecretValue("GROK_API_KEY");
    if (apiKey) {
      return {
        token: apiKey,
        model: input.model,
        voice: input.voice,
        expiresAt: Date.now() + 29 * 60 * 1000,
      };
    }
  }

  return {
    token: `mock_${input.provider}_${randomUUID()}`,
    model: input.model,
    voice: input.voice,
    expiresAt: Date.now() + 29 * 60 * 1000,
  };
}
