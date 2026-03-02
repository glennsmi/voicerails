import { BaseAdapter } from "./base.js";
const OPENAI_CAPABILITIES = {
    nativeAudioOutput: true,
    serverVad: true,
    clientTurnNudge: false,
    toolCalling: true,
    userTranscriptDelta: true,
    userSpeechStartEvent: true,
    interruptionEvent: false,
    textOnlyMode: false,
};
export class OpenAiAdapter extends BaseAdapter {
    providerId = "openai";
    capabilities = OPENAI_CAPABILITIES;
    responseInProgress = false;
    queuedResponse = false;
    constructor(emitter) {
        super(emitter);
    }
    buildUrl(config) {
        return `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`;
    }
    buildProtocols(config) {
        return ["realtime", `openai-insecure-api-key.${config.token}`, "openai-beta.realtime-v1"];
    }
    buildAudioEnvelope(base64Audio) {
        return {
            type: "input_audio_buffer.append",
            audio: base64Audio,
        };
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
    triggerResponse(prompt) {
        super.triggerResponse(prompt);
        this.requestResponseCreate();
    }
    respondToToolCall(callId, output) {
        super.respondToToolCall(callId, output);
        this.requestResponseCreate();
    }
    handleProviderMessage(message) {
        const type = message.type;
        switch (type) {
            case "input_audio_buffer.speech_started":
                this.emitter.emit("user_speech_started");
                return;
            case "conversation.item.input_audio_transcription.delta":
                this.emitter.emit("user_transcript", {
                    text: message.delta ?? "",
                    streamKey: `${message.item_id ?? "user"}:${message.content_index ?? 0}`,
                    isFinal: false,
                });
                return;
            case "conversation.item.input_audio_transcription.completed":
                this.emitter.emit("user_transcript", {
                    text: message.transcript ?? "",
                    streamKey: `${message.item_id ?? "user"}:${message.content_index ?? 0}`,
                    isFinal: true,
                });
                return;
            case "response.audio.delta":
                this.emitter.emit("assistant_audio", {
                    audioBase64: message.delta ?? "",
                    sampleRate: this.config?.audio.outputSampleRate ?? 24000,
                });
                return;
            case "response.audio_transcript.delta":
                this.emitter.emit("assistant_transcript", {
                    text: message.delta ?? "",
                    streamKey: message.response_id ?? message.response?.id ?? "assistant",
                    isFinal: false,
                });
                return;
            case "response.audio_transcript.done":
                this.emitter.emit("assistant_transcript", {
                    text: message.transcript ?? "",
                    streamKey: message.response_id ?? message.response?.id ?? "assistant",
                    isFinal: true,
                });
                return;
            case "response.output_item.done":
                if (message.item?.type === "function_call") {
                    this.emitToolCall({
                        callId: message.item.call_id ?? message.item.id ?? crypto.randomUUID(),
                        name: message.item.name ?? "tool",
                        args: parseToolArgs(message.item.arguments),
                    });
                }
                return;
            case "response.function_call_arguments.done":
                this.emitToolCall({
                    callId: message.call_id ?? message.id ?? crypto.randomUUID(),
                    name: message.name ?? "tool",
                    args: parseToolArgs(message.arguments),
                });
                return;
            case "response.created":
                this.responseInProgress = true;
                return;
            case "response.done":
                this.responseInProgress = false;
                this.emitter.emit("turn_complete");
                if (this.queuedResponse) {
                    this.queuedResponse = false;
                    this.requestResponseCreate();
                }
                return;
            case "error":
                this.emitter.emit("error", {
                    code: message.error?.code ?? "openai_error",
                    message: message.error?.message ?? "Unknown OpenAI realtime error",
                    recoverable: true,
                });
                return;
            default:
                return;
        }
    }
    requestResponseCreate() {
        if (this.responseInProgress) {
            this.queuedResponse = true;
            return;
        }
        this.sendJson({ type: "response.create" });
        this.responseInProgress = true;
    }
}
function parseToolArgs(argumentsPayload) {
    if (typeof argumentsPayload === "string") {
        try {
            return JSON.parse(argumentsPayload);
        }
        catch {
            return {};
        }
    }
    if (argumentsPayload && typeof argumentsPayload === "object") {
        return argumentsPayload;
    }
    return {};
}
//# sourceMappingURL=openai.js.map