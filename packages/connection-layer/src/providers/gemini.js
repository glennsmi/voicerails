import { BaseAdapter } from "./base.js";
const GEMINI_CAPABILITIES = {
    nativeAudioOutput: true,
    serverVad: true,
    clientTurnNudge: true,
    toolCalling: true,
    userTranscriptDelta: true,
    userSpeechStartEvent: false,
    interruptionEvent: true,
    textOnlyMode: false,
};
const GEMINI_STALL_TIMEOUT_MS = 8000;
const GEMINI_STALL_RETRY_MS = 5000;
const GEMINI_STALL_MAX_RETRIES = 2;
export class GeminiAdapter extends BaseAdapter {
    providerId = "gemini";
    capabilities = GEMINI_CAPABILITIES;
    setupComplete = false;
    stallRetries = 0;
    stallTimeout;
    stallRetryInterval;
    constructor(emitter) {
        super(emitter);
    }
    buildUrl(config) {
        const token = encodeURIComponent(config.token);
        return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
    }
    buildAudioEnvelope(base64Audio) {
        const sampleRate = this.config?.audio.inputSampleRate ?? 16000;
        return {
            realtimeInput: {
                audio: {
                    data: base64Audio,
                    mimeType: `audio/pcm;rate=${sampleRate}`,
                },
            },
        };
    }
    buildTextEnvelope(text) {
        return {
            clientContent: {
                turns: [{ role: "user", parts: [{ text }] }],
                turnComplete: true,
            },
        };
    }
    buildToolResponseEnvelope(callId, output) {
        return {
            toolResponse: {
                functionResponses: [
                    {
                        id: callId,
                        response: safeJson(output),
                    },
                ],
            },
        };
    }
    buildSeedMessageEnvelope(message) {
        return {
            clientContent: {
                turns: [{ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.text }] }],
                turnComplete: true,
            },
        };
    }
    afterConnect(config) {
        this.sendJson({
            setup: {
                model: config.model,
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: config.voice,
                            },
                        },
                    },
                },
            },
        });
        this.startStallRecovery();
    }
    handleProviderMessage(message) {
        if (message.setupComplete) {
            this.setupComplete = true;
            return;
        }
        const inputText = message.inputTranscription?.text ??
            message.input_transcription?.text ??
            message.serverContent?.inputTranscription?.text ??
            message.serverContent?.input_transcription?.text;
        if (inputText) {
            this.markGeminiActivity();
            this.emitter.emit("user_transcript", {
                text: sanitizeGeminiTranscript(inputText),
                streamKey: `gemini-user-${Date.now()}`,
                isFinal: false,
            });
        }
        const outputText = message.outputTranscription?.text ??
            message.output_transcription?.text ??
            message.serverContent?.outputTranscription?.text ??
            message.serverContent?.output_transcription?.text;
        if (outputText) {
            this.markGeminiActivity();
            this.emitter.emit("assistant_transcript", {
                text: sanitizeGeminiTranscript(outputText),
                streamKey: `gemini-assistant-${Date.now()}`,
                isFinal: false,
            });
        }
        const inlineAudio = message.serverContent?.modelTurn?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
        if (inlineAudio) {
            this.markGeminiActivity();
            this.emitter.emit("assistant_audio", {
                audioBase64: inlineAudio,
                sampleRate: this.config?.audio.outputSampleRate ?? 24000,
            });
        }
        const functionCalls = message.toolCall?.functionCalls ??
            message.tool_call?.function_calls ??
            message.serverContent?.toolCall?.functionCalls ??
            [];
        for (const call of functionCalls) {
            this.emitToolCall({
                callId: call.id ?? crypto.randomUUID(),
                name: call.name ?? "tool",
                args: call.args ?? {},
            });
        }
        if (message.serverContent?.interrupted === true) {
            this.emitter.emit("interrupted");
            this.resetStallRecovery();
        }
        if (message.serverContent?.turnComplete === true) {
            this.emitter.emit("turn_complete");
            this.resetStallRecovery();
        }
        if (message.error || message.goAway) {
            this.emitter.emit("error", {
                code: "gemini_error",
                message: message.error?.message ?? message.goAway?.message ?? "Gemini realtime error",
                recoverable: false,
            });
        }
    }
    disconnect() {
        super.disconnect();
        this.clearStallTimers();
    }
    startStallRecovery() {
        this.clearStallTimers();
        this.stallTimeout = setTimeout(() => {
            this.stallRetryInterval = setInterval(() => {
                if (this.stallRetries >= GEMINI_STALL_MAX_RETRIES) {
                    this.clearStallTimers();
                    return;
                }
                this.sendJson({ clientContent: { turnComplete: true } });
                this.stallRetries += 1;
            }, GEMINI_STALL_RETRY_MS);
        }, GEMINI_STALL_TIMEOUT_MS);
    }
    markGeminiActivity() {
        this.stallRetries = 0;
        this.startStallRecovery();
    }
    resetStallRecovery() {
        this.stallRetries = 0;
        this.startStallRecovery();
    }
    clearStallTimers() {
        if (this.stallTimeout)
            clearTimeout(this.stallTimeout);
        if (this.stallRetryInterval)
            clearInterval(this.stallRetryInterval);
    }
}
function sanitizeGeminiTranscript(text) {
    return text
        .replace(/<[^>]*>/g, "")
        .replace(/\[ctrl\d+\]/gi, "")
        .replace(/\u0000/g, "")
        .trim();
}
function safeJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return { result: value };
    }
}
//# sourceMappingURL=gemini.js.map