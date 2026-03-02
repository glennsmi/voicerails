export class BaseAdapter {
    emitter;
    ws;
    handledToolCallIds = new Set();
    config;
    constructor(emitter) {
        this.emitter = emitter;
    }
    async connect(config) {
        this.config = config;
        await this.openWebSocket(this.buildUrl(config), this.buildProtocols(config));
        if (!this.ws) {
            throw new Error(`${this.providerId} socket failed to initialize`);
        }
        this.ws.onmessage = (event) => this.handleRawMessage(String(event.data));
        this.ws.onclose = () => this.emitter.emit("disconnected", {
            reason: `${this.providerId}_socket_closed`,
            intentional: false,
        });
        this.ws.onerror = () => this.emitter.emit("error", {
            code: `${this.providerId}_socket_error`,
            message: `${this.providerId} websocket error`,
            recoverable: true,
        });
        this.afterConnect(config);
        this.emitter.emit("ready");
    }
    disconnect() {
        this.ws?.close();
        this.emitter.emit("disconnected", {
            reason: `${this.providerId}_disconnect`,
            intentional: true,
        });
    }
    sendAudio(base64Audio) {
        this.sendJson(this.buildAudioEnvelope(base64Audio));
    }
    sendText(text) {
        this.sendJson(this.buildTextEnvelope(text));
    }
    respondToToolCall(callId, output) {
        this.sendJson(this.buildToolResponseEnvelope(callId, output));
    }
    seedContext(messages) {
        for (const message of messages) {
            this.sendJson(this.buildSeedMessageEnvelope(message));
        }
    }
    triggerResponse(prompt) {
        this.sendText(prompt);
    }
    afterConnect(_config) { }
    buildProtocols(_config) {
        return undefined;
    }
    emitToolCall(event) {
        if (this.handledToolCallIds.has(event.callId)) {
            return;
        }
        this.handledToolCallIds.add(event.callId);
        this.emitter.emit("tool_call", event);
    }
    sendJson(payload) {
        this.ws?.send(JSON.stringify(payload));
    }
    async openWebSocket(url, protocols) {
        await new Promise((resolve, reject) => {
            try {
                this.ws = protocols?.length ? new WebSocket(url, protocols) : new WebSocket(url);
            }
            catch (error) {
                reject(error);
                return;
            }
            const timeout = setTimeout(() => reject(new Error(`${this.providerId} websocket open timeout`)), 20000);
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
    handleRawMessage(raw) {
        try {
            this.handleProviderMessage(JSON.parse(raw));
        }
        catch {
            this.emitter.emit("error", {
                code: "provider_parse_error",
                message: `${this.providerId} returned malformed event payload`,
                recoverable: true,
            });
        }
    }
}
//# sourceMappingURL=base.js.map