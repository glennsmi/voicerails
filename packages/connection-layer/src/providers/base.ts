import type {
  ConversationMessage,
  VoiceConnectionConfig,
  VoiceProvider,
  ToolCallEvent,
} from "../types.js";
import {TypedEventEmitter} from "../events.js";

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

export abstract class BaseAdapter implements ProviderAdapter {
  protected ws?: WebSocket;
  protected readonly handledToolCallIds = new Set<string>();
  protected config?: VoiceConnectionConfig;

  abstract readonly providerId: VoiceProvider;
  abstract readonly capabilities: ProviderCapabilities;

  constructor(protected readonly emitter: TypedEventEmitter) {}

  async connect(config: VoiceConnectionConfig): Promise<void> {
    this.config = config;
    await this.openWebSocket(this.buildUrl(config), this.buildProtocols(config));
    if (!this.ws) {
      throw new Error(`${this.providerId} socket failed to initialize`);
    }
    this.ws.onmessage = (event) => this.handleRawMessage(String(event.data));
    this.ws.onclose = () =>
      this.emitter.emit("disconnected", {
        reason: `${this.providerId}_socket_closed`,
        intentional: false,
      });
    this.ws.onerror = () =>
      this.emitter.emit("error", {
        code: `${this.providerId}_socket_error`,
        message: `${this.providerId} websocket error`,
        recoverable: true,
      });
    this.afterConnect(config);
    this.emitter.emit("ready");
  }

  disconnect(): void {
    this.ws?.close();
    this.emitter.emit("disconnected", {
      reason: `${this.providerId}_disconnect`,
      intentional: true,
    });
  }

  sendAudio(base64Audio: string): void {
    this.sendJson(this.buildAudioEnvelope(base64Audio));
  }

  sendText(text: string): void {
    this.sendJson(this.buildTextEnvelope(text));
  }

  respondToToolCall(callId: string, output: string): void {
    this.sendJson(this.buildToolResponseEnvelope(callId, output));
  }

  seedContext(messages: ConversationMessage[]): void {
    for (const message of messages) {
      this.sendJson(this.buildSeedMessageEnvelope(message));
    }
  }

  triggerResponse(prompt: string): void {
    this.sendText(prompt);
  }

  protected afterConnect(_config: VoiceConnectionConfig): void {}

  protected abstract buildUrl(config: VoiceConnectionConfig): string;
  protected buildProtocols(_config: VoiceConnectionConfig): string[] | undefined {
    return undefined;
  }
  protected abstract buildAudioEnvelope(base64Audio: string): unknown;
  protected abstract buildTextEnvelope(text: string): unknown;
  protected abstract buildToolResponseEnvelope(callId: string, output: string): unknown;
  protected abstract buildSeedMessageEnvelope(message: ConversationMessage): unknown;
  protected abstract handleProviderMessage(message: any): void;

  protected emitToolCall(event: ToolCallEvent): void {
    if (this.handledToolCallIds.has(event.callId)) {
      return;
    }
    this.handledToolCallIds.add(event.callId);
    this.emitter.emit("tool_call", event);
  }

  protected sendJson(payload: unknown): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private async openWebSocket(url: string, protocols?: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        this.ws = protocols?.length ? new WebSocket(url, protocols) : new WebSocket(url);
      } catch (error) {
        reject(error);
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error(`${this.providerId} websocket open timeout`)),
        20000,
      );
      this.ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`${this.providerId} websocket open error`));
      };
    });
  }

  private handleRawMessage(raw: string): void {
    try {
      this.handleProviderMessage(JSON.parse(raw));
    } catch {
      this.emitter.emit("error", {
        code: "provider_parse_error",
        message: `${this.providerId} returned malformed event payload`,
        recoverable: true,
      });
    }
  }
}
