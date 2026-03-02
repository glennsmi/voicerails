import type { ConversationMessage, VoiceConnection, VoiceConnectionConfig, VoiceEventMap } from "./types.js";
export declare class VoiceConnectionClient implements VoiceConnection {
    private readonly emitter;
    private adapter?;
    private _state;
    get state(): "disconnected" | "connecting" | "ready" | "error";
    connect(config: VoiceConnectionConfig): Promise<void>;
    disconnect(): void;
    sendAudio(base64Audio: string): void;
    sendText(text: string): void;
    respondToToolCall(callId: string, output: string): void;
    seedContext(messages: ConversationMessage[]): void;
    triggerResponse(prompt: string): void;
    on<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void;
    off<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void;
}
