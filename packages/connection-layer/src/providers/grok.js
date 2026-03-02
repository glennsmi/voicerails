import { BaseAdapter } from "./base.js";
const GROK_CAPABILITIES = {
    nativeAudioOutput: true,
    serverVad: true,
    clientTurnNudge: true,
    toolCalling: true,
    userTranscriptDelta: false,
    userSpeechStartEvent: false,
    interruptionEvent: false,
    textOnlyMode: false,
};
export class GrokAdapter extends BaseAdapter {
    providerId = "grok";
    capabilities = GROK_CAPABILITIES;
    lastAssistantText = "";
    constructor(emitter) {
        super(emitter);
    }
    buildUrl(_config) {
        return "wss://api.x.ai/v1/realtime";
    }
    buildProtocols(config) {
        return [`xai-client-secret.${config.token}`];
    }
    buildAudioEnvelope(base64Audio) {
        return { type: "input_audio_buffer.append", audio: base64Audio };
    }
    buildTextEnvelope(text) {
        return {
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text }],
            },
        };
    }
    buildToolResponseEnvelope(callId, output) {
        return {
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output },
        };
    }
    buildSeedMessageEnvelope(message) {
        return {
            type: "conversation.item.create",
            item: {
                type: "message",
                role: message.role,
                content: [{ type: "input_text", text: message.text }],
            },
        };
    }
    afterConnect(config) {
        const isTelephony = config.audio.inputFormat === "g711_ulaw";
        this.sendJson({
            type: "session.update",
            session: {
                instructions: config.systemPrompt,
                voice: normalizeVoiceName(config.voice),
                turn_detection: { type: "server_vad" },
                audio: isTelephony
                    ? {
                        input: { format: { type: "audio/pcmu" } },
                        output: { format: { type: "audio/pcmu" } },
                    }
                    : {
                        input: { format: { type: "audio/pcm", rate: config.audio.inputSampleRate } },
                        output: { format: { type: "audio/pcm", rate: config.audio.outputSampleRate } },
                    },
                tools: config.tools.map((tool) => ({
                    type: "function",
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                })),
            },
        });
    }
    triggerResponse(prompt) {
        super.triggerResponse(prompt);
        this.sendJson({ type: "response.create" });
    }
    respondToToolCall(callId, output) {
        super.respondToToolCall(callId, output);
        this.sendJson({ type: "response.create" });
    }
    handleProviderMessage(message) {
        switch (message.type) {
            case "conversation.item.input_audio_transcription.completed":
                this.emitter.emit("user_transcript", {
                    text: message.transcript ?? "",
                    streamKey: `${message.item_id ?? "user"}:${message.content_index ?? 0}`,
                    isFinal: true,
                });
                return;
            case "response.output_audio.delta":
                this.emitter.emit("assistant_audio", {
                    audioBase64: message.delta ?? "",
                    sampleRate: this.config?.audio.outputSampleRate ?? 24000,
                });
                return;
            case "response.output_audio_transcript.delta":
                this.emitter.emit("assistant_transcript", {
                    text: message.delta ?? "",
                    streamKey: message.response_id ?? "assistant",
                    isFinal: false,
                });
                return;
            case "response.output_audio_transcript.done": {
                const text = message.transcript ?? "";
                if (text && normalizeText(text) === normalizeText(this.lastAssistantText)) {
                    this.emitter.emit("duplicate_response_detected", { text });
                }
                this.lastAssistantText = text;
                this.emitter.emit("assistant_transcript", {
                    text,
                    streamKey: message.response_id ?? "assistant",
                    isFinal: true,
                });
                return;
            }
            case "response.function_call_arguments.done":
                this.emitToolCall({
                    callId: message.call_id ?? crypto.randomUUID(),
                    name: message.name ?? "tool",
                    args: parseToolArgs(message.arguments),
                });
                return;
            case "response.done":
                this.emitter.emit("turn_complete");
                return;
            case "error":
                this.emitter.emit("error", {
                    code: message.error?.code ?? "grok_error",
                    message: message.error?.message ?? "Grok realtime error",
                    recoverable: true,
                });
                return;
            default:
                return;
        }
    }
}
function parseToolArgs(args) {
    if (typeof args === "string") {
        try {
            return JSON.parse(args);
        }
        catch {
            return {};
        }
    }
    return args && typeof args === "object" ? args : {};
}
function normalizeVoiceName(value) {
    if (!value)
        return "Ara";
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
function normalizeText(value) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}
//# sourceMappingURL=grok.js.map