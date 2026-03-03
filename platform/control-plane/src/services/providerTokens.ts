import {randomUUID} from "node:crypto";
import type {VoiceProvider} from "@voicerails/connection-layer";
import {getSecretValue} from "./secretManager.js";

export interface ProviderSessionToken {
  token: string;
  model: string;
  voice: string;
  expiresAt: number;
}

export class ProviderTokenError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderTokenError";
  }
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
    if (!key) {
      throw new ProviderTokenError(
        "provider_not_configured",
        "OPENAI_API_KEY is not configured for OpenAI/ElevenLabs sessions",
        400,
      );
    }
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
    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) {
      throw new ProviderTokenError(
        "provider_session_failed",
        `OpenAI session token request failed: ${response.status}`,
        502,
      );
    }
    const token = payload?.client_secret?.value;
    if (token) {
      return {
        token,
        model: input.model,
        voice: input.voice,
        expiresAt: Number(payload?.client_secret?.expires_at ?? Date.now() + 29 * 60 * 1000),
      };
    }
    throw new ProviderTokenError(
      "provider_session_failed",
      "OpenAI session token response missing client secret",
      502,
    );
  }

  if (input.provider === "gemini") {
    const apiKey = await getSecretValue("GEMINI_API_KEY");
    if (!apiKey) {
      throw new ProviderTokenError(
        "provider_not_configured",
        "GEMINI_API_KEY is not configured for Gemini sessions",
        400,
      );
    }
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
    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) {
      throw new ProviderTokenError(
        "provider_session_failed",
        `Gemini auth token request failed: ${response.status}`,
        502,
      );
    }
    if (payload?.name) {
      return {
        token: payload.name,
        model: input.model,
        voice: input.voice,
        expiresAt: Date.now() + 29 * 60 * 1000,
      };
    }
    throw new ProviderTokenError(
      "provider_session_failed",
      "Gemini auth token response missing token name",
      502,
    );
  }

  if (input.provider === "grok") {
    const apiKey = await getSecretValue("GROK_API_KEY");
    if (!apiKey) {
      throw new ProviderTokenError(
        "provider_not_configured",
        "GROK_API_KEY is not configured for Grok sessions",
        400,
      );
    }
    return {
      token: apiKey,
      model: input.model,
      voice: input.voice,
      expiresAt: Date.now() + 29 * 60 * 1000,
    };
  }

  if (process.env.ALLOW_MOCK_PROVIDER_TOKENS === "true") {
    return {
      token: `mock_${input.provider}_${randomUUID()}`,
      model: input.model,
      voice: input.voice,
      expiresAt: Date.now() + 29 * 60 * 1000,
    };
  }

  throw new ProviderTokenError(
    "provider_not_configured",
    `Provider '${input.provider}' is not configured for session token creation`,
    400,
  );
}
