import type { ConversationMessage, VoiceConnectionConfig } from "../types.js";
import { BaseAdapter, type ProviderCapabilities } from "./base.js";
import { TypedEventEmitter } from "../events.js";
export declare class ElevenLabsAdapter extends BaseAdapter {
    private readonly synthesizeSpeech;
    readonly providerId: "elevenlabs";
    readonly capabilities: ProviderCapabilities;
    private currentAssistantText;
    constructor(emitter: TypedEventEmitter, synthesizeSpeech: (text: string, voiceId: string) => Promise<string>);
    protected buildUrl(config: VoiceConnectionConfig): string;
    protected buildProtocols(config: VoiceConnectionConfig): string[];
    protected buildAudioEnvelope(base64Audio: string): unknown;
    protected buildTextEnvelope(text: string): unknown;
    protected buildToolResponseEnvelope(callId: string, output: string): unknown;
    protected buildSeedMessageEnvelope(message: ConversationMessage): unknown;
    triggerResponse(prompt: string): void;
    protected handleProviderMessage(message: any): void;
    private emitSynthesizedAudio;
}
