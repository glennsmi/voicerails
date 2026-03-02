import { BaseAdapter } from "./base.js";
const ELEVENLABS_CAPABILITIES = {
    nativeAudioOutput: false,
    serverVad: true,
    clientTurnNudge: false,
    toolCalling: true,
    userTranscriptDelta: true,
    userSpeechStartEvent: true,
    interruptionEvent: false,
    textOnlyMode: true,
};
export class ElevenLabsAdapter extends BaseAdapter {
    synthesizeSpeech;
    providerId = "elevenlabs";
    capabilities = ELEVENLABS_CAPABILITIES;
    currentAssistantText = "";
    constructor(emitter, synthesizeSpeech) {
        super(emitter);
        this.synthesizeSpeech = synthesizeSpeech;
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
        this.sendJson({ type: "response.create" });
    }
    handleProviderMessage(message) {
        switch (message.type) {
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
            case "response.text.delta":
            case "response.audio_transcript.delta":
                this.currentAssistantText += message.delta ?? "";
                this.emitter.emit("assistant_transcript", {
                    text: this.currentAssistantText,
                    streamKey: message.response_id ?? message.response?.id ?? "assistant",
                    isFinal: false,
                });
                return;
            case "response.text.done":
            case "response.audio_transcript.done": {
                const finalText = message.text ?? message.transcript ?? this.currentAssistantText;
                this.emitter.emit("assistant_transcript", {
                    text: finalText,
                    streamKey: message.response_id ?? message.response?.id ?? "assistant",
                    isFinal: true,
                });
                void this.emitSynthesizedAudio(finalText);
                this.currentAssistantText = "";
                return;
            }
            case "response.output_item.done":
                if (message.item?.type === "function_call") {
                    this.emitToolCall({
                        callId: message.item.call_id ?? crypto.randomUUID(),
                        name: message.item.name ?? "tool",
                        args: parseToolArgs(message.item.arguments),
                    });
                }
                return;
            case "response.done":
                this.emitter.emit("turn_complete");
                return;
            case "error":
                this.emitter.emit("error", {
                    code: message.error?.code ?? "elevenlabs_error",
                    message: message.error?.message ?? "ElevenLabs hybrid transport error",
                    recoverable: true,
                });
                return;
            default:
                return;
        }
    }
    async emitSynthesizedAudio(text) {
        if (!text.trim()) {
            return;
        }
        try {
            const audioBase64 = await this.synthesizeSpeech(text, this.config?.voice ?? "21m00Tcm4TlvDq8ikWAM");
            this.emitter.emit("assistant_audio", {
                audioBase64,
                sampleRate: this.config?.audio.outputSampleRate ?? 24000,
            });
        }
        catch (error) {
            this.emitter.emit("error", {
                code: "elevenlabs_tts_error",
                message: `Failed to synthesize ElevenLabs speech: ${error.message}`,
                recoverable: true,
            });
        }
    }
}
function parseToolArgs(payload) {
    if (typeof payload === "string") {
        try {
            return JSON.parse(payload);
        }
        catch {
            return {};
        }
    }
    return payload && typeof payload === "object" ? payload : {};
}
//# sourceMappingURL=elevenlabs.js.map