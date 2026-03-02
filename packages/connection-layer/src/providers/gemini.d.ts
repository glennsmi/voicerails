import type { ConversationMessage, VoiceConnectionConfig } from "../types.js";
import { BaseAdapter, type ProviderCapabilities } from "./base.js";
import { TypedEventEmitter } from "../events.js";
export declare class GeminiAdapter extends BaseAdapter {
    readonly providerId: "gemini";
    readonly capabilities: ProviderCapabilities;
    private setupComplete;
    private stallRetries;
    private stallTimeout?;
    private stallRetryInterval?;
    constructor(emitter: TypedEventEmitter);
    protected buildUrl(config: VoiceConnectionConfig): string;
    protected buildAudioEnvelope(base64Audio: string): unknown;
    protected buildTextEnvelope(text: string): unknown;
    protected buildToolResponseEnvelope(callId: string, output: string): unknown;
    protected buildSeedMessageEnvelope(message: ConversationMessage): unknown;
    protected afterConnect(config: VoiceConnectionConfig): void;
    protected handleProviderMessage(message: any): void;
    disconnect(): void;
    private startStallRecovery;
    private markGeminiActivity;
    private resetStallRecovery;
    private clearStallTimers;
}
