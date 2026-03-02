import {TypedEventEmitter} from "./events.js";
import type {
  ConversationMessage,
  VoiceConnection,
  VoiceConnectionConfig,
  VoiceEventMap,
} from "./types.js";
import {createProviderAdapter} from "./providers/index.js";
import type {ProviderAdapter} from "./providers/base.js";

async function defaultSynthesizeSpeech(text: string): Promise<string> {
  return text;
}

export class VoiceConnectionClient implements VoiceConnection {
  private readonly emitter = new TypedEventEmitter();
  private adapter?: ProviderAdapter;
  private _state: "disconnected" | "connecting" | "ready" | "error" = "disconnected";

  get state(): "disconnected" | "connecting" | "ready" | "error" {
    return this._state;
  }

  async connect(config: VoiceConnectionConfig): Promise<void> {
    this._state = "connecting";
    this.adapter = createProviderAdapter(config.provider, this.emitter, defaultSynthesizeSpeech);
    try {
      await this.adapter.connect(config);
      this._state = "ready";
    } catch (error) {
      this._state = "error";
      this.emitter.emit("error", {
        code: "connect_failed",
        message: (error as Error).message,
        recoverable: true,
      });
      throw error;
    }
  }

  disconnect(): void {
    this.adapter?.disconnect();
    this._state = "disconnected";
  }

  sendAudio(base64Audio: string): void {
    this.adapter?.sendAudio(base64Audio);
  }

  sendText(text: string): void {
    this.adapter?.sendText(text);
  }

  respondToToolCall(callId: string, output: string): void {
    this.adapter?.respondToToolCall(callId, output);
  }

  seedContext(messages: ConversationMessage[]): void {
    this.adapter?.seedContext(messages);
  }

  triggerResponse(prompt: string): void {
    this.adapter?.triggerResponse(prompt);
  }

  on<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void {
    this.emitter.on(event, handler);
  }

  off<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void {
    this.emitter.off(event, handler);
  }
}
