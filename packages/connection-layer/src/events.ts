import type {VoiceEventMap} from "./types.js";

type Handler<E extends keyof VoiceEventMap> = VoiceEventMap[E];

export class TypedEventEmitter {
  private readonly listeners = new Map<keyof VoiceEventMap, Set<Function>>();

  on<E extends keyof VoiceEventMap>(event: E, handler: Handler<E>): void {
    const eventListeners = this.listeners.get(event) ?? new Set();
    eventListeners.add(handler as Function);
    this.listeners.set(event, eventListeners);
  }

  off<E extends keyof VoiceEventMap>(event: E, handler: Handler<E>): void {
    this.listeners.get(event)?.delete(handler as Function);
  }

  emit<E extends keyof VoiceEventMap>(
    event: E,
    ...args: Parameters<VoiceEventMap[E]>
  ): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      return;
    }
    for (const listener of eventListeners) {
      (listener as any)(...args);
    }
  }
}
