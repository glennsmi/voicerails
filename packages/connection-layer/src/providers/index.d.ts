import { TypedEventEmitter } from "../events.js";
import type { ProviderAdapter } from "./base.js";
import type { VoiceProvider } from "../types.js";
export declare function createProviderAdapter(provider: VoiceProvider, emitter: TypedEventEmitter, synthesizeSpeech: (text: string, voiceId: string) => Promise<string>): ProviderAdapter;
