import { TypedEventEmitter } from "./events.js";
import { createProviderAdapter } from "./providers/index.js";
async function defaultSynthesizeSpeech(text) {
    return text;
}
export class VoiceConnectionClient {
    emitter = new TypedEventEmitter();
    adapter;
    _state = "disconnected";
    get state() {
        return this._state;
    }
    async connect(config) {
        this._state = "connecting";
        this.adapter = createProviderAdapter(config.provider, this.emitter, defaultSynthesizeSpeech);
        try {
            await this.adapter.connect(config);
            this._state = "ready";
        }
        catch (error) {
            this._state = "error";
            this.emitter.emit("error", {
                code: "connect_failed",
                message: error.message,
                recoverable: true,
            });
            throw error;
        }
    }
    disconnect() {
        this.adapter?.disconnect();
        this._state = "disconnected";
    }
    sendAudio(base64Audio) {
        this.adapter?.sendAudio(base64Audio);
    }
    sendText(text) {
        this.adapter?.sendText(text);
    }
    respondToToolCall(callId, output) {
        this.adapter?.respondToToolCall(callId, output);
    }
    seedContext(messages) {
        this.adapter?.seedContext(messages);
    }
    triggerResponse(prompt) {
        this.adapter?.triggerResponse(prompt);
    }
    on(event, handler) {
        this.emitter.on(event, handler);
    }
    off(event, handler) {
        this.emitter.off(event, handler);
    }
}
//# sourceMappingURL=voiceConnection.js.map