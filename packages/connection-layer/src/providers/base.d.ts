import type { ConversationMessage, VoiceConnectionConfig, VoiceProvider, ToolCallEvent } from "../types.js";
import { TypedEventEmitter } from "../events.js";
export interface ProviderCapabilities {
    nativeAudioOutput: boolean;
    serverVad: boolean;
    clientTurnNudge: boolean;
    toolCalling: boolean;
    userTranscriptDelta: boolean;
    userSpeechStartEvent: boolean;
    interruptionEvent: boolean;
    textOnlyMode: boolean;
}
export interface ProviderAdapter {
    readonly providerId: VoiceProvider;
    readonly capabilities: ProviderCapabilities;
    connect(config: VoiceConnectionConfig): Promise<void>;
    disconnect(): void;
    sendAudio(base64Audio: string): void;
    sendText(text: string): void;
    respondToToolCall(callId: string, output: string): void;
    seedContext(messages: ConversationMessage[]): void;
    triggerResponse(prompt: string): void;
}
export declare abstract class BaseAdapter implements ProviderAdapter {
    protected readonly emitter: TypedEventEmitter;
    protected ws?: WebSocket;
    protected readonly handledToolCallIds: Set<string>;
    protected config?: VoiceConnectionConfig;
    abstract readonly providerId: VoiceProvider;
    abstract readonly capabilities: ProviderCapabilities;
    constructor(emitter: TypedEventEmitter);
    connect(config: VoiceConnectionConfig): Promise<void>;
    disconnect(): void;
    sendAudio(base64Audio: string): void;
    sendText(text: string): void;
    respondToToolCall(callId: string, output: string): void;
    seedContext(messages: ConversationMessage[]): void;
    triggerResponse(prompt: string): void;
    protected afterConnect(_config: VoiceConnectionConfig): void;
    protected abstract buildUrl(config: VoiceConnectionConfig): string;
    protected buildProtocols(_config: VoiceConnectionConfig): string[] | undefined;
    protected abstract buildAudioEnvelope(base64Audio: string): unknown;
    protected abstract buildTextEnvelope(text: string): unknown;
    protected abstract buildToolResponseEnvelope(callId: string, output: string): unknown;
    protected abstract buildSeedMessageEnvelope(message: ConversationMessage): unknown;
    protected abstract handleProviderMessage(message: any): void;
    protected emitToolCall(event: ToolCallEvent): void;
    protected sendJson(payload: unknown): void;
    private openWebSocket;
    private handleRawMessage;
}
