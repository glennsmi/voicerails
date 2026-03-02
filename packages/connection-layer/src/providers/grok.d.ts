import type { ConversationMessage, VoiceConnectionConfig } from "../types.js";
import { BaseAdapter, type ProviderCapabilities } from "./base.js";
import { TypedEventEmitter } from "../events.js";
export declare class GrokAdapter extends BaseAdapter {
    readonly providerId: "grok";
    readonly capabilities: ProviderCapabilities;
    private lastAssistantText;
    constructor(emitter: TypedEventEmitter);
    protected buildUrl(_config: VoiceConnectionConfig): string;
    protected buildProtocols(config: VoiceConnectionConfig): string[];
    protected buildAudioEnvelope(base64Audio: string): unknown;
    protected buildTextEnvelope(text: string): unknown;
    protected buildToolResponseEnvelope(callId: string, output: string): unknown;
    protected buildSeedMessageEnvelope(message: ConversationMessage): unknown;
    protected afterConnect(config: VoiceConnectionConfig): void;
    triggerResponse(prompt: string): void;
    respondToToolCall(callId: string, output: string): void;
    protected handleProviderMessage(message: any): void;
}
