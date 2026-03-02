import type { VoiceEventMap } from "./types.js";
type Handler<E extends keyof VoiceEventMap> = VoiceEventMap[E];
export declare class TypedEventEmitter {
    private readonly listeners;
    on<E extends keyof VoiceEventMap>(event: E, handler: Handler<E>): void;
    off<E extends keyof VoiceEventMap>(event: E, handler: Handler<E>): void;
    emit<E extends keyof VoiceEventMap>(event: E, ...args: Parameters<VoiceEventMap[E]>): void;
}
export {};
