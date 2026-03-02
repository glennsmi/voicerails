export type VoiceProvider = "openai" | "gemini" | "elevenlabs" | "grok";
export interface JsonSchema {
    type: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    enum?: string[];
    items?: JsonSchema;
    description?: string;
}
export interface ToolDeclaration {
    name: string;
    description: string;
    parameters: JsonSchema;
}
export interface ConversationMessage {
    role: "user" | "assistant";
    text: string;
}
export interface AudioConfig {
    inputSampleRate: number;
    outputSampleRate: number;
    inputFormat: "pcm16" | "g711_ulaw";
    outputFormat: "pcm16" | "g711_ulaw";
}
export interface TranscriptionConfig {
    model?: string;
    language?: string;
}
export interface ResolvedExperienceControls {
    pauseTolerance: "very_low" | "low" | "medium" | "high" | "very_high";
    interruptionSensitivity: "very_low" | "low" | "medium" | "high";
    falseInputGuard: "low" | "medium" | "high" | "very_high";
    turnCommitPolicy: "server_only" | "hybrid_fallback";
    responseTempo: "reflective" | "balanced" | "fast";
    echoGuardMs: number;
    speechEnergyThreshold: number;
    turnNudgeMs: number;
    providerOverrides?: Record<string, unknown>;
}
export interface VoiceConnectionConfig {
    provider: VoiceProvider;
    token: string;
    model: string;
    voice: string;
    systemPrompt: string;
    tools: ToolDeclaration[];
    experienceControls: ResolvedExperienceControls;
    audio: AudioConfig;
    transcription?: TranscriptionConfig;
}
export interface TranscriptEvent {
    text: string;
    streamKey: string;
    isFinal: boolean;
}
export interface AudioEvent {
    audioBase64: string;
    sampleRate: number;
}
export interface ToolCallEvent {
    callId: string;
    name: string;
    args: Record<string, unknown>;
}
export interface ErrorEvent {
    code: string;
    message: string;
    recoverable: boolean;
}
export interface VoiceEventMap {
    ready: () => void;
    user_speech_started: () => void;
    user_transcript: (data: TranscriptEvent) => void;
    assistant_transcript: (data: TranscriptEvent) => void;
    assistant_audio: (data: AudioEvent) => void;
    tool_call: (data: ToolCallEvent) => void;
    turn_complete: () => void;
    interrupted: () => void;
    error: (data: ErrorEvent) => void;
    disconnected: (data: {
        reason: string;
        intentional: boolean;
    }) => void;
    duplicate_response_detected: (data: {
        text: string;
    }) => void;
}
export interface VoiceConnection {
    connect(config: VoiceConnectionConfig): Promise<void>;
    disconnect(): void;
    sendAudio(base64Audio: string): void;
    sendText(text: string): void;
    respondToToolCall(callId: string, output: string): void;
    seedContext(messages: ConversationMessage[]): void;
    triggerResponse(prompt: string): void;
    readonly state: "disconnected" | "connecting" | "ready" | "error";
    on<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void;
    off<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void;
}
