import {TypedEventEmitter} from "../events.js";
import type {ProviderAdapter} from "./base.js";
import {OpenAiAdapter} from "./openai.js";
import {GeminiAdapter} from "./gemini.js";
import {GrokAdapter} from "./grok.js";
import {ElevenLabsAdapter} from "./elevenlabs.js";
import type {VoiceProvider} from "../types.js";

export function createProviderAdapter(
  provider: VoiceProvider,
  emitter: TypedEventEmitter,
  synthesizeSpeech: (text: string, voiceId: string) => Promise<string>,
): ProviderAdapter {
  switch (provider) {
    case "openai":
      return new OpenAiAdapter(emitter);
    case "gemini":
      return new GeminiAdapter(emitter);
    case "grok":
      return new GrokAdapter(emitter);
    case "elevenlabs":
      return new ElevenLabsAdapter(emitter, synthesizeSpeech);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported provider ${(exhaustive as string) ?? "unknown"}`);
    }
  }
}
