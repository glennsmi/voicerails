# VoiceRails — Technical Implementation Guide

**Version:** 1.0  
**Date:** 2026-03-01  
**Status:** Implemented baseline — Phase 1-4 delivered  
**Companion to:** `voice-infrastructure-prd-v2.md` (product requirements)  
**Source material:** `voice-implementation-learnings.md` (raw learnings from Flank production)

---

## 1. Purpose

This document is the engineering blueprint for building the VoiceRails connection layer — the core runtime that sits between application code and real-time voice providers. It translates the product requirements from the PRD into precise technical contracts, provider-specific translation tables, and implementation patterns proven in production.

An engineer reading this document should be able to build a provider-agnostic voice connection layer without needing to read any provider documentation, experiment with VAD tuning, or discover provider-specific event schema differences themselves.

**This document defines:**
- The connection layer architecture and its boundaries
- Adapter interface contracts for each provider
- The normalized event schema all providers map into
- Provider-specific configuration, event translation, and known quirks
- The Voice Experience Controls translation layer (VAD, echo, turn management)
- Audio pipeline specification for in-app and telephony channels
- Resilience patterns (stall recovery, duplicate suppression, echo guard)
- Tool calling abstraction across providers
- Session lifecycle and continuity contracts

**This document does not define:**
- Application-level UI, state management, or business logic
- Billing, metering, or pricing
- Deployment infrastructure or CI/CD
- Workflow engine or extraction engine internals

---

## 2. Architectural Principle — The Clean Split

### 2.1 The Problem

In a naive implementation, voice session code becomes a single monolith containing provider WebSocket management, audio encoding, VAD workarounds, transcript rendering, tool call processing, session state, and business logic. This is what happened in the Flank prototype — a 2,000-line React hook that is difficult to test, extend, or port.

### 2.2 The Separation

VoiceRails splits the voice stack into two layers with a strict contract boundary:

```
┌─────────────────────────────────────────────────┐
│                 APPLICATION LAYER                │
│                                                  │
│  Transcript UI · Session state · Business tools  │
│  End detection · User preferences · Billing      │
│  Workflow engine · Extraction · Memory            │
│                                                  │
│  Consumes: NormalizedVoiceEvent                  │
│  Calls:    VoiceConnection.sendAudio()           │
│            VoiceConnection.sendText()            │
│            VoiceConnection.respondToToolCall()   │
└──────────────────────┬──────────────────────────┘
                       │ Normalized events + commands
┌──────────────────────┴──────────────────────────┐
│               CONNECTION LAYER                   │
│                                                  │
│  Provider adapters · WebSocket management        │
│  Audio format conversion · VAD translation       │
│  Tool schema translation · Event normalization   │
│  Echo guard · Stall recovery · Turn nudging      │
│                                                  │
│  Owns: Provider WebSocket lifecycle              │
│  Owns: Audio encoding/decoding                   │
│  Owns: Provider-specific event parsing           │
│  Owns: Provider-specific quirk handling          │
└─────────────────────────────────────────────────┘
```

### 2.3 Boundary Rules

**The connection layer MUST NOT:**
- Know about application state, UI frameworks, or rendering
- Reference Firestore, session IDs, user IDs, or billing
- Make decisions about session end detection or conversation flow
- Filter or suppress events based on business rules (e.g. duplicate response policy is app-layer)
- Import React, Angular, Vue, or any UI framework

**The connection layer MUST:**
- Be framework-agnostic (vanilla TypeScript, event-emitter pattern)
- Work identically in browser (in-app) and Node.js (telephony bridge) environments
- Normalise all provider events into the canonical schema
- Handle all provider-specific connection, setup, and teardown sequences
- Manage audio format conversion based on declared config
- Implement provider-level resilience (stall recovery, reconnection)
- Translate unified Voice Experience Controls into provider-specific parameters

---

## 3. Connection Layer API Contract

### 3.1 VoiceConnection Interface

```typescript
interface VoiceConnection {
  /** Connect to the voice provider and begin the session. */
  connect(config: VoiceConnectionConfig): Promise<void>;

  /** Gracefully disconnect from the provider. */
  disconnect(): void;

  /** Send captured audio to the provider. */
  sendAudio(base64Audio: string): void;

  /** Send a text message into the conversation (typed input). */
  sendText(text: string): void;

  /** Respond to a tool call from the model. */
  respondToToolCall(callId: string, output: string): void;

  /** Seed prior conversation context for session continuity. */
  seedContext(messages: ConversationMessage[]): void;

  /** Send a prompt to trigger the model's first response. */
  triggerResponse(prompt: string): void;

  /** Current connection state. */
  readonly state: 'disconnected' | 'connecting' | 'ready' | 'error';

  /** Register event handlers. */
  on<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void;
  off<E extends keyof VoiceEventMap>(event: E, handler: VoiceEventMap[E]): void;
}
```

### 3.2 Configuration

```typescript
interface VoiceConnectionConfig {
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

type VoiceProvider = 'openai' | 'gemini' | 'elevenlabs' | 'grok';

interface AudioConfig {
  inputSampleRate: number;    // 16000 (in-app) or 8000 (telephony)
  outputSampleRate: number;   // 24000 (in-app) or 8000 (telephony)
  inputFormat: 'pcm16' | 'g711_ulaw';
  outputFormat: 'pcm16' | 'g711_ulaw';
}

interface TranscriptionConfig {
  model?: string;             // e.g. 'gpt-4o-transcribe'
  language?: string;          // ISO 639-1, e.g. 'en', 'pt-BR'
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchema;
}
```

### 3.3 Normalized Event Schema

Every provider adapter normalises its events into this canonical schema. The application layer never sees provider-specific event shapes.

```typescript
interface VoiceEventMap {
  /** Session is fully connected and ready to stream. */
  ready: () => void;

  /** Provider VAD detected user speech onset. */
  user_speech_started: () => void;

  /** Partial (streaming) user transcript. */
  user_transcript: (data: TranscriptEvent) => void;

  /** Partial (streaming) assistant transcript. */
  assistant_transcript: (data: TranscriptEvent) => void;

  /** Audio chunk from the assistant for playback. */
  assistant_audio: (data: AudioEvent) => void;

  /** Model invoked a registered tool. */
  tool_call: (data: ToolCallEvent) => void;

  /** The model's turn is complete (all output delivered). */
  turn_complete: () => void;

  /** User interrupted the assistant mid-response. */
  interrupted: () => void;

  /** Provider or connection error. */
  error: (data: ErrorEvent) => void;

  /** Connection closed (intentional or not). */
  disconnected: (data: { reason: string; intentional: boolean }) => void;
}

interface TranscriptEvent {
  text: string;
  streamKey: string;
  isFinal: boolean;
}

interface AudioEvent {
  audioBase64: string;
  sampleRate: number;
}

interface ToolCallEvent {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

interface ErrorEvent {
  code: string;
  message: string;
  recoverable: boolean;
}
```

---

## 4. Provider Adapter Architecture

### 4.1 Adapter Interface

Each voice provider is implemented as an adapter conforming to a shared internal interface. The connection layer instantiates the correct adapter based on `config.provider` and delegates all provider-specific work to it.

```typescript
interface ProviderAdapter {
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

interface ProviderCapabilities {
  nativeAudioOutput: boolean;     // false for ElevenLabs
  serverVad: boolean;             // true for all current providers
  clientTurnNudge: boolean;       // true for Gemini, Grok
  toolCalling: boolean;           // true for all current providers
  userTranscriptDelta: boolean;   // true for OpenAI, Gemini; false for Grok
  userSpeechStartEvent: boolean;  // true for OpenAI; false for Gemini, Grok
  interruptionEvent: boolean;     // true for Gemini; false for OpenAI, Grok
  textOnlyMode: boolean;          // true for ElevenLabs
}
```

### 4.2 Capability Matrix

| Capability | OpenAI | Gemini | ElevenLabs | Grok |
|-----------|--------|--------|------------|------|
| Native audio output | Yes | Yes | No (text→TTS) | Yes |
| Server VAD | Yes | Yes | Yes (via OpenAI) | Yes |
| Fine-grained VAD params | Yes (`threshold`, `silence_duration_ms`, `prefix_padding_ms`) | Yes (`silenceDurationMs`, `prefixPaddingMs`, sensitivities) | Yes (via OpenAI) | Minimal (`server_vad` only) |
| Client turn nudge needed | No | Yes | No | Yes |
| Tool calling | Yes | Yes | Yes (via OpenAI) | Yes |
| User transcript delta | Yes | Yes (via transcription events) | Yes (via OpenAI) | No (final only) |
| User speech start event | Yes | No | Yes (via OpenAI) | No |
| Interruption event | No | Yes (`interrupted`) | No | No |
| Text-only transport mode | N/A | N/A | Required | N/A |
| Telephony (G.711) support | Yes (`g711_ulaw`) | No | No | Yes (`audio/pcmu`) |

### 4.3 Provider Registration

```typescript
const PROVIDER_REGISTRY: Record<VoiceProvider, () => ProviderAdapter> = {
  openai: () => new OpenAiAdapter(),
  gemini: () => new GeminiAdapter(),
  elevenlabs: () => new ElevenLabsAdapter(),
  grok: () => new GrokAdapter(),
};
```

Adapters are stateless factories. Each `connect()` call creates a fresh WebSocket connection.

---

## 5. Provider-Specific Adapter Specifications

### 5.1 OpenAI Realtime Adapter

**Connection:**
- URL: `wss://api.openai.com/v1/realtime?model={model}`
- Browser auth: WebSocket subprotocols `['realtime', 'openai-insecure-api-key.{token}', 'openai-beta.realtime-v1']`
- Server auth: HTTP headers `Authorization: Bearer {key}`, `OpenAI-Beta: realtime=v1`
- Session is pre-configured during token issuance — no setup message needed post-connect

**Token issuance (backend):**
```
POST https://api.openai.com/v1/realtime/sessions
Body: { model, voice, instructions, modalities, input_audio_format, output_audio_format,
        input_audio_transcription, turn_detection, tools }
Response: { client_secret: { value: string, expires_at: number } }
```

**Audio send envelope:**
```json
{ "type": "input_audio_buffer.append", "audio": "<base64>" }
```

**Text input:**
```json
{
  "type": "conversation.item.create",
  "item": { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "..." }] }
}
```
Followed by `{ "type": "response.create" }`.

**Context seeding (resume):**
Each message sent as `conversation.item.create` with role and `input_text` content.

**Response lifecycle:**
- `response.created` → mark response-in-progress
- `response.done` → clear response-in-progress; if queued `response.create` pending, send it now
- If `response.create` is sent while a response is active, OpenAI returns an error. The adapter MUST queue and retry after `response.done`.

**Event mapping:**

| OpenAI Event | Normalized Event |
|-------------|-----------------|
| `input_audio_buffer.speech_started` | `user_speech_started` |
| `conversation.item.input_audio_transcription.delta` | `user_transcript` (isFinal: false) |
| `conversation.item.input_audio_transcription.completed` | `user_transcript` (isFinal: true) |
| `response.audio.delta` | `assistant_audio` |
| `response.audio_transcript.delta` | `assistant_transcript` (isFinal: false) |
| `response.audio_transcript.done` | `assistant_transcript` (isFinal: true) |
| `response.text.delta` | `assistant_transcript` (isFinal: false) — text-only mode |
| `response.text.done` | `assistant_transcript` (isFinal: true) — text-only mode |
| `response.output_item.done` (function_call) | `tool_call` |
| `response.function_call_arguments.done` | `tool_call` (alternate path) |
| `response.done` | `turn_complete` |
| `error` | `error` |

**Channel guard requirement:** OpenAI can emit BOTH `response.audio_transcript.*` and `response.text.*` for the same response. The adapter MUST track which channel arrived first per response (keyed by `response_id`) and suppress the second. Audio channel takes priority over text if both arrive.

**Tool call response:**
```json
{
  "type": "conversation.item.create",
  "item": { "type": "function_call_output", "call_id": "<id>", "output": "<json-string>" }
}
```
Followed by `response.create` (respecting the response-in-progress queue).

**Tool call deduplication:** Track handled `call_id` values in a Set. Both `response.output_item.done` and `response.function_call_arguments.done` can fire for the same call.

**Stream key derivation:**
- User: `item_id` + `:` + `content_index` (if present)
- Assistant: `response_id` from event or nested `response.id`

---

### 5.2 Gemini Live Adapter

**Connection:**
- URL: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token={token}`
- Auth: query parameter

**Token issuance (backend):**
```
POST https://generativelanguage.googleapis.com/v1alpha/auth_tokens
Headers: x-goog-api-key: {apiKey}
Body: { uses: 1, expireTime, newSessionExpireTime, bidiGenerateContentSetup: { model, generationConfig, systemInstruction, tools, realtimeInputConfig, inputAudioTranscription: {}, outputAudioTranscription: {} } }
Response: { name: string }   ← this IS the token
```

**Two-phase setup (critical):**
Even though the token request includes full config, the client MUST send a setup message after WebSocket opens and wait for `setupComplete`:

```json
{
  "setup": {
    "model": "...",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": { "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "..." } } }
    }
  }
}
```
Wait for frame containing `{ "setupComplete": ... }`. Timeout: 15 seconds.

**Audio send envelope:**
```json
{ "realtimeInput": { "audio": { "data": "<base64>", "mimeType": "audio/pcm;rate=16000" } } }
```

**Text input:**
```json
{ "clientContent": { "turns": [{ "role": "user", "parts": [{ "text": "..." }] }], "turnComplete": true } }
```

**Context seeding (resume):**
All messages sent in a single `clientContent` with `turns` array. Gemini uses `"model"` instead of `"assistant"` for the AI role.

**Event mapping:**

Gemini uses a different structural pattern. Events are nested in `serverContent`, `inputTranscription`, `outputTranscription`, or `toolCall` — not in a `type` field.

| Gemini Structure | Normalized Event |
|-----------------|-----------------|
| `inputTranscription.text` (top-level or nested in `serverContent`) | `user_transcript` (isFinal: false) |
| `outputTranscription.text` (top-level or nested in `serverContent`) | `assistant_transcript` (isFinal: false) |
| `serverContent.modelTurn.parts[].inlineData.data` | `assistant_audio` |
| `serverContent.turnComplete: true` | `turn_complete` + finalize all partials as isFinal: true |
| `serverContent.interrupted: true` | `interrupted` |
| `toolCall.functionCalls[]` or `tool_call.function_calls[]` | `tool_call` (one per function call) |
| `error` or `goAway` | `error` |

**Transcript location ambiguity:** Check BOTH top-level and `serverContent`-nested paths. Check BOTH camelCase (`inputTranscription`) and snake_case (`input_transcription`).

**Transcript sanitisation:** Gemini produces control character artifacts. The adapter MUST strip:
```
/<[^>]*>/g           → ''    // <ctrl46>, <br>, etc.
/\[ctrl\d+\]/gi      → ''    // [ctrl46]
/\u0000/g            → ''    // null bytes
```

**Tool call format differences:**
- Tool declarations use uppercase type names: `OBJECT`, `STRING`, `NUMBER`
- Tool call args arrive as a parsed object (NOT a JSON string)
- Multiple function calls can arrive in one event

**Tool call response:**
```json
{ "toolResponse": { "functionResponses": [{ "id": "...", "name": "...", "response": { ... } }] } }
```

**Stream key derivation:**
Sequential counters: `gemini-user-{n}`, `gemini-assistant-{n}`. Gemini does not provide response IDs or item IDs like OpenAI.

**Stall recovery (adapter-owned):**
Gemini occasionally stalls — user speaks, audio is sent, but no response arrives. The adapter implements an internal stall recovery timer:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Stall timeout | 8000ms | Time since last activity before first recovery attempt |
| Retry interval | 5000ms | Delay between subsequent recovery nudges |
| Max retries | 2 | Stop nudging after this many attempts |

Recovery action: send `{ "clientContent": { "turnComplete": true } }`.
Activity is tracked on every audio or transcript output event. Timer resets on `turnComplete` or `interrupted`.

Stall recovery conditions (all must be true):
- Time since last activity exceeds stall timeout
- Assistant is not currently speaking or streaming
- Retry count has not been exhausted

**Telephony support:** Not available. Gemini does not support G.711 μ-law audio. Supporting telephony would require real-time audio transcoding in the bridge.

---

### 5.3 Grok Realtime Adapter

**Connection:**
- URL: `wss://api.x.ai/v1/realtime`
- Browser auth: WebSocket subprotocol `['xai-client-secret.{token}']`
- Server auth: HTTP header `Authorization: Bearer {key}`

**Post-connection setup:**
Grok has no ephemeral token endpoint. Config is sent via `session.update` after connection opens. Wait for `session.updated` response. Timeout: 15 seconds.

```json
{
  "type": "session.update",
  "session": {
    "instructions": "...",
    "voice": "Ara",
    "turn_detection": { "type": "server_vad" },
    "audio": {
      "input": { "format": { "type": "audio/pcm", "rate": 16000 } },
      "output": { "format": { "type": "audio/pcm", "rate": 24000 } }
    },
    "tools": [...]
  }
}
```

For telephony (G.711):
```json
"audio": {
  "input": { "format": { "type": "audio/pcmu" } },
  "output": { "format": { "type": "audio/pcmu" } }
}
```

**Audio send envelope:** Same as OpenAI:
```json
{ "type": "input_audio_buffer.append", "audio": "<base64>" }
```

**Text input and context seeding:** Same format as OpenAI (`conversation.item.create`).

**Event mapping:**

| Grok Event | Normalized Event | Note |
|-----------|-----------------|------|
| `conversation.item.input_audio_transcription.completed` | `user_transcript` (isFinal: true) | No delta events |
| `response.output_audio.delta` | `assistant_audio` | Different from OpenAI's `response.audio.delta` |
| `response.output_audio_transcript.delta` | `assistant_transcript` (isFinal: false) | Different from OpenAI |
| `response.output_audio_transcript.done` | `assistant_transcript` (isFinal: true) | Different from OpenAI |
| `response.function_call_arguments.done` | `tool_call` | Flat event with `name`, `arguments`, `call_id` at top level |
| `response.done` | `turn_complete` | |
| `error` | `error` | |

**Voice name normalisation:** Grok voices are title-cased (Ara, Rex, Sal, Eve, Leo). The adapter MUST normalise input: `value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()`.

**Turn nudge:** Grok requires client-side turn nudging (same as Gemini). The nudge command is:
```json
{ "type": "input_audio_buffer.commit" }
```
Followed by:
```json
{ "type": "response.create" }
```

**Tool call response:** Same format as OpenAI (`conversation.item.create` with `function_call_output`, then `response.create`).

**Duplicate response suppression:** Grok can loop, repeating the same response verbatim. The adapter SHOULD emit a `duplicate_response` warning event but MUST still emit the transcript — the app layer decides whether to suppress display.

**Stream key derivation:** Same as OpenAI (from `response_id`).

---

### 5.4 ElevenLabs Adapter (Hybrid Transport)

ElevenLabs is not a standalone realtime provider. The adapter uses OpenAI Realtime in text-only mode and delegates audio synthesis to a separate TTS service.

**Architecture:**
```
App Audio In → [OpenAI Realtime, modalities: ['text']] → Text Response
                                                           ↓
                                              [ElevenLabs TTS API]
                                                           ↓
                                                  Audio Response → App
```

**Connection:** Uses OpenAI Realtime connection (same URL, auth, and setup), with key differences:
- `modalities: ['text']` — no audio output from the model
- No `voice` in session config
- No `output_audio_format`

**Token issuance:** Same as OpenAI, with `modalities: ['text']` in the request body.

**TTS synthesis (per assistant response):**
```
POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream?output_format=pcm_24000
Headers: xi-api-key: {apiKey}
Body: { "text": "...", "model_id": "eleven_flash_v2_5" }
Response: raw PCM audio (24kHz, 16-bit, mono)
```

Default voice ID: `21m00Tcm4TlvDq8ikWAM` (Rachel).

**Event flow:**
1. OpenAI emits `response.text.delta` / `response.audio_transcript.delta` → emit `assistant_transcript`
2. On `response.text.done` / `response.audio_transcript.done` → call TTS API → emit `assistant_audio` with synthesised audio

The adapter MUST handle both text-channel and audio-transcript-channel events. The channel guard applies the same way as OpenAI.

**Extended echo guard:** ElevenLabs requires a longer echo guard (900ms vs 250ms) due to the TTS round-trip latency. This is baked into the adapter's echo guard timing.

**Short transcript rejection:** User transcripts of 2 or fewer words are dropped when there was no recent local speech energy. This compensates for the higher echo bleed-through with ElevenLabs TTS.

**Telephony support:** Not directly available. Falls back to OpenAI adapter for telephony (losing the ElevenLabs voice).

---

## 6. Voice Experience Controls — Translation Layer

### 6.1 Canonical Controls

These are the platform-level controls exposed to developers via API and visual designer. See `voice-experience-controls-spec.md` for product details.

```typescript
interface ResolvedExperienceControls {
  pauseTolerance: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  interruptionSensitivity: 'very_low' | 'low' | 'medium' | 'high';
  falseInputGuard: 'low' | 'medium' | 'high' | 'very_high';
  turnCommitPolicy: 'server_only' | 'hybrid_fallback';
  responseTempo: 'reflective' | 'balanced' | 'fast';
  echoGuardMs: number;           // derived from falseInputGuard + provider
  speechEnergyThreshold: number; // derived from falseInputGuard
  turnNudgeMs: number;           // derived from pauseTolerance + turnCommitPolicy
  providerOverrides?: Record<string, unknown>;
}
```

### 6.2 Pause Tolerance → VAD Silence Duration

| Pause Tolerance | OpenAI `silence_duration_ms` | OpenAI `prefix_padding_ms` | Gemini `silenceDurationMs` | Gemini `prefixPaddingMs` | Gemini `endOfSpeechSensitivity` |
|----------------|------|------|------|------|------|
| very_low | 300 | 100 | 300 | 100 | END_SENSITIVITY_HIGH |
| low | 500 | 150 | 500 | 150 | END_SENSITIVITY_HIGH |
| medium | 900 | 200 | 800 | 180 | END_SENSITIVITY_MEDIUM |
| high | 1500 | 260 | 1400 | 220 | END_SENSITIVITY_LOW |
| very_high | 2200 | 350 | 2000 | 300 | END_SENSITIVITY_LOW |

Grok: `{ type: 'server_vad' }` only (no fine-grained params). Pause tolerance has no direct translation; the platform compensates via `turnNudgeMs`.

### 6.3 Interruption Sensitivity → VAD Threshold

| Interruption Sensitivity | OpenAI `threshold` | Gemini `startOfSpeechSensitivity` |
|-------------------------|-------------------|--------------------------------|
| very_low | 0.7 | START_SENSITIVITY_LOW |
| low | 0.5 | START_SENSITIVITY_MEDIUM |
| medium | 0.4 | START_SENSITIVITY_HIGH |
| high | 0.25 | START_SENSITIVITY_HIGH |

Lower OpenAI threshold = more sensitive to quiet speech = easier to interrupt.

### 6.4 False Input Guard → Echo + Energy Configuration

| False Input Guard | Echo Guard (ms) | ElevenLabs Echo Guard (ms) | Speech RMS Threshold | Speech Peak Threshold | Short Transcript Rejection |
|-----|------|------|-------|-------|------|
| low | 100 | 400 | 0.005 | 0.03 | Disabled |
| medium | 250 | 700 | 0.011 | 0.07 | 2 words (ElevenLabs only) |
| high | 400 | 900 | 0.015 | 0.10 | 2 words (all providers) |
| very_high | 600 | 1200 | 0.020 | 0.12 | 3 words (all providers) |

### 6.5 Turn Commit Policy → Nudge Configuration

| Policy | Behaviour | Turn Nudge | Providers Affected |
|--------|-----------|------------|-------------------|
| server_only | Trust provider VAD entirely | Disabled | All |
| hybrid_fallback | Use provider VAD + client fallback nudge | Enabled (2800ms default, scaled by pauseTolerance) | Gemini, Grok |

Turn nudge delay scales with pause tolerance:

| Pause Tolerance | Turn Nudge Ms (when hybrid) |
|----------------|---------------------------|
| very_low | 1500 |
| low | 2000 |
| medium | 2800 |
| high | 3500 |
| very_high | 4500 |

### 6.6 Response Tempo

Response tempo affects the kickoff behaviour but is primarily a prompt-layer concern. The connection layer does not implement tempo directly — it is passed through to the system prompt or workflow configuration.

### 6.7 Default Presets

| Preset | Pause | Interruption | Guard | Turn Policy | Tempo |
|--------|-------|-------------|-------|-------------|-------|
| **Reflective Coaching** | high | low | very_high | server_only | reflective |
| **Balanced Assistant** | medium | medium | medium | hybrid_fallback | balanced |
| **Fast Support** | low | high | medium | hybrid_fallback | fast |
| **Phone Triage** | very_low | high | low | hybrid_fallback | fast |

---

## 7. Audio Pipeline Specification

### 7.1 In-App Audio Capture

```
Microphone
  → getUserMedia({ channelCount: 1, sampleRate: 16000,
                   echoCancellation: true, noiseSuppression: true, autoGainControl: true })
  → AudioContext (16kHz)
  → MediaStreamSource → AudioWorkletNode ('pcm-processor')
  → Float32 chunks (batched at 4096 samples / ~256ms in worklet)
  → Main thread buffer (flush at 2048 samples / ~128ms OR 120ms timer)
  → Float32 → Int16 conversion
  → Base64 encoding
  → VoiceConnection.sendAudio()
```

**Audio constraints are non-negotiable for echo prevention.** All three browser-level features (`echoCancellation`, `noiseSuppression`, `autoGainControl`) must be enabled.

**The AudioWorklet MUST NOT connect to `ctx.destination`** — this would feed mic audio back through speakers.

### 7.2 In-App Audio Playback

```
VoiceConnection 'assistant_audio' event
  → Base64 → Uint8Array → Int16Array → Float32Array (÷32768)
  → AudioBuffer at outputSampleRate (24kHz)
  → AudioBufferSourceNode → ctx.destination
  → Gapless scheduling: start at max(now, nextPlayTime), advance nextPlayTime by duration
```

**Gapless scheduling** is essential for natural-sounding speech. Without it, there are audible clicks/gaps between chunks.

### 7.3 Telephony Audio

Twilio Media Streams deliver G.711 μ-law audio at 8kHz as base64 payloads. The bridge forwards these directly to providers that support μ-law natively:
- OpenAI: format `g711_ulaw`
- Grok: format `audio/pcmu`

No transcoding is needed when provider and telephony format match. If a provider doesn't support G.711 (Gemini), it cannot be used for telephony without adding a transcoding layer.

### 7.4 Audio Format Envelope Per Provider

| Provider | Send Format | Envelope |
|----------|------------|----------|
| OpenAI | PCM16 or G.711 | `{ "type": "input_audio_buffer.append", "audio": "<b64>" }` |
| Gemini | PCM16 only | `{ "realtimeInput": { "audio": { "data": "<b64>", "mimeType": "audio/pcm;rate=16000" } } }` |
| Grok | PCM16 or G.711 | `{ "type": "input_audio_buffer.append", "audio": "<b64>" }` |
| ElevenLabs | PCM16 (via OpenAI) | Same as OpenAI |

---

## 8. Echo Suppression Framework

Echo suppression is a connection-layer responsibility because it requires coordination between audio send timing, provider event processing, and local speech energy detection.

### 8.1 Six-Layer Defence

| Layer | Scope | Mechanism |
|-------|-------|-----------|
| 1. Browser audio constraints | All providers | `echoCancellation`, `noiseSuppression`, `autoGainControl` on getUserMedia |
| 2. Echo guard window | Configurable per provider | Suppress user audio processing for `audioDuration + echoGuardMs` after each assistant audio chunk |
| 3. Local speech energy gate | All providers | Track RMS and peak amplitude; require recent genuine speech before accepting transcripts |
| 4. Short transcript rejection | Configurable | Drop finalised user transcripts below word count threshold when no recent local speech detected |
| 5. Speech-started filtering | OpenAI only | Ignore `speech_started` events that arrive during echo guard window |
| 6. Post-response guard | Configurable | Apply additional echo guard after `turn_complete` / `response.done` |

### 8.2 Echo Guard Timing

The echo guard window is calculated per audio chunk:

```
suppressUntil = max(currentSuppressUntil, now + audioDurationMs + echoGuardMs)
```

Audio send is blocked while `now < suppressUntil`. User transcript events received during the guard window are queued and evaluated when the guard expires — if the user actually spoke (confirmed by energy detection), the transcript is accepted; otherwise it is discarded.

### 8.3 Speech Energy Detection

Run on every outgoing audio chunk before send:

```typescript
function hasSpeechLikeEnergy(samples: Float32Array): boolean {
  let sumSquares = 0, peak = 0;
  for (const s of samples) {
    sumSquares += s * s;
    if (Math.abs(s) > peak) peak = Math.abs(s);
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return rms >= rmsThreshold || peak >= peakThreshold;
}
```

When speech energy is detected, record the timestamp. "Recent speech" = within the last `LOCAL_SPEECH_RECENCY_MS` (default 5000ms).

---

## 9. Turn Management

### 9.1 Turn Nudge (Gemini, Grok)

Some providers' server VAD does not reliably detect turn completion, particularly with soft speech endings. The connection layer implements a client-side fallback:

1. Reset the nudge timer on every audio chunk with speech energy
2. When timer fires (at `turnNudgeMs`):
   - Guard: skip if no user audio since last turn
   - Guard: skip if assistant is currently outputting audio or transcript
   - Guard: skip if `responseCooldownMs` has not elapsed since last `turn_complete`
   - Flush any buffered audio
   - Send provider-specific turn completion signal

**Provider-specific nudge commands:**

| Provider | Command |
|----------|---------|
| Gemini | `{ "clientContent": { "turnComplete": true } }` |
| Grok | `{ "type": "input_audio_buffer.commit" }` then `{ "type": "response.create" }` |
| OpenAI | Not used (server VAD sufficient) |

### 9.2 Response Cooldown

After every `turn_complete` event, enforce a cooldown before accepting turn nudges:

```
RESPONSE_COOLDOWN_MS = 4000ms (default, scales with pauseTolerance)
```

This prevents the model's own audio from bleeding through echo cancellation, being detected as user speech, and triggering a nudge that creates a self-conversation loop. This is the single most important anti-loop safeguard.

### 9.3 Duplicate Response Detection

Expose a `duplicate_response_detected` event when the adapter sees consecutive identical responses. The app layer decides policy (suppress display, break the loop, show warning).

Detection: compare normalised text of each `assistant_transcript` (isFinal: true) with the previous one. If they match, increment counter. Reset on any `user_transcript` (isFinal: true).

---

## 10. Tool Calling Abstraction

### 10.1 Unified Tool Declaration

Developers define tools once using the platform schema:

```typescript
interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}
```

### 10.2 Schema Translation

The connection layer translates this into provider-specific format at session setup:

| Platform Schema | OpenAI | Gemini | Grok |
|----------------|--------|--------|------|
| `type: 'object'` | `type: 'object'` | `type: 'OBJECT'` | `type: 'object'` |
| `type: 'string'` | `type: 'string'` | `type: 'STRING'` | `type: 'string'` |
| `type: 'number'` | `type: 'number'` | `type: 'NUMBER'` | `type: 'number'` |
| Wrapper | `{ type: 'function', name, description, parameters }` | `{ functionDeclarations: [{ name, description, parameters }] }` | Same as OpenAI |

### 10.3 Tool Call Event Normalisation

Regardless of provider, all tool calls are normalised to:

```typescript
{ callId: string; name: string; args: Record<string, unknown> }
```

Provider-specific parsing:
- **OpenAI:** `args` arrives as JSON string in `item.arguments` → JSON.parse
- **Gemini:** `args` arrives as parsed object in `fc.args` → use directly
- **Grok:** `args` arrives as JSON string in `msg.arguments` → JSON.parse

### 10.4 Tool Call Response Routing

The `respondToToolCall(callId, output)` method translates to:

**OpenAI/Grok:**
```json
{ "type": "conversation.item.create", "item": { "type": "function_call_output", "call_id": "<id>", "output": "<json>" } }
```
Then trigger response (with queue management for OpenAI).

**Gemini:**
```json
{ "toolResponse": { "functionResponses": [{ "id": "<id>", "name": "<name>", "response": <output> }] } }
```

### 10.5 Tool Call Deduplication

The adapter maintains a `Set<string>` of processed call IDs per session. If the same `callId` arrives again, the adapter silently skips it. Some providers emit tool call completion events more than once.

---

## 11. Session Lifecycle

### 11.1 State Machine

```
disconnected → connecting → ready → [streaming] → disconnecting → disconnected
                   ↓                                                    ↑
                 error ─────────────────────────────────────────────────┘
```

### 11.2 Connection Sequence

1. Instantiate provider adapter from registry
2. Open WebSocket with provider-specific URL and auth
3. Timeout if connection doesn't open within 20 seconds
4. Send provider-specific setup message (Gemini, Grok)
5. Wait for setup confirmation (Gemini: `setupComplete`, Grok: `session.updated`)
6. Timeout if setup doesn't complete within 15 seconds
7. Attach message handler
8. Emit `ready` event

### 11.3 Context Seeding (Session Resume)

After `ready`, before triggering the first response:
1. Call `seedContext(messages)` with prior conversation history (max 40 messages)
2. Call `triggerResponse(prompt)` with the kickoff or resume prompt

The adapter translates seeding into provider-specific format:
- **OpenAI/Grok:** Individual `conversation.item.create` per message
- **Gemini:** Single `clientContent` with `turns` array (using `"model"` role for assistant messages)

### 11.4 Disconnection

1. Set intentional-close flag
2. Close WebSocket
3. Clear all internal timers (stall, nudge, cooldown)
4. Emit `disconnected` with `intentional: true`

On unexpected close:
1. Emit `error` with connection details
2. Emit `disconnected` with `intentional: false`
3. App layer decides whether to reconnect

### 11.5 Resource Cleanup (App Layer Responsibility)

The connection layer handles its own WebSocket and timer cleanup. The app layer is responsible for:
- AudioContext lifecycle (capture + playback)
- MediaStream track cleanup
- AudioWorklet disconnection
- UI state reset

---

## 12. Transcript Stream Management

While transcript rendering is an app-layer concern, the connection layer provides the stream key infrastructure that enables single-bubble-per-turn rendering.

### 12.1 Stream Keys

Every `user_transcript` and `assistant_transcript` event includes a `streamKey`. The contract:

- All events for a single user utterance share the same `streamKey`
- All events for a single assistant response share the same `streamKey`
- `isFinal: false` events update the same bubble
- `isFinal: true` locks the bubble — no further updates for that key
- A new `streamKey` means a new bubble

### 12.2 Stream Key Generation Per Provider

| Provider | User Stream Key | Assistant Stream Key |
|----------|----------------|---------------------|
| OpenAI | `{item_id}:{content_index}` | `{response_id}` |
| Gemini | `gemini-user-{counter}` | `gemini-assistant-{counter}` |
| Grok | `{item_id}:{content_index}` | `{response_id}` |
| ElevenLabs | Same as OpenAI | Same as OpenAI |

### 12.3 Recommended App-Layer Pattern

```typescript
const bubbles = new Map<string, TranscriptBubble>();

connection.on('user_transcript', ({ text, streamKey, isFinal }) => {
  if (isFinal) {
    bubbles.set(streamKey, { role: 'user', text, streaming: false });
  } else {
    bubbles.set(streamKey, { role: 'user', text, streaming: true });
  }
});
```

---

## 13. Telephony Integration

### 13.1 Bridge Architecture

The telephony bridge is a standalone server that connects Twilio Media Streams to voice provider adapters. It uses the same `ProviderAdapter` interface as in-app voice, configured with G.711 audio format.

```
Twilio Media Stream (WSS)
  → Bridge Server (Cloud Run)
    → ProviderAdapter.sendAudio(μ-law base64)
    ← ProviderAdapter 'assistant_audio' → Twilio media event
    ← ProviderAdapter 'user_transcript' → accumulate transcript
    ← ProviderAdapter 'tool_call' → process extraction
  → On call end: finalize session with transcript + usage
```

### 13.2 Bridge Session Lifecycle

1. Twilio `start` event → extract custom parameters (userId, sessionType, trigger)
2. Call platform backend `POST /v1/sessions` → get session config
3. Create `ProviderAdapter` with G.711 audio config
4. `adapter.connect()` → `seedContext()` → `triggerResponse()`
5. Twilio `media` events → `adapter.sendAudio(payload)`
6. Adapter `assistant_audio` → send back to Twilio as media event
7. Twilio `stop` or socket close → `adapter.disconnect()` → finalize session

### 13.3 Provider Support for Telephony

| Provider | Telephony Support | Audio Format | Notes |
|----------|------------------|-------------|-------|
| OpenAI | Yes | `g711_ulaw` | Full support, recommended |
| Grok | Yes | `audio/pcmu` | G.711 μ-law native, zero resampling |
| Gemini | No | N/A | Does not support G.711; would require transcoding |
| ElevenLabs | Via OpenAI fallback | `g711_ulaw` | Loses ElevenLabs voice, uses OpenAI voice |

### 13.4 Telephony VAD Differences

Phone calls require faster turn-taking than in-app voice. The telephony audio profile uses tighter VAD settings:

| Parameter | In-App (coaching) | Telephony |
|-----------|-------------------|-----------|
| OpenAI threshold | 0.4 | 0.5 |
| OpenAI silence_duration_ms | 1500 | 350 |
| OpenAI prefix_padding_ms | 260 | 120 |

The platform should expose a `channel` parameter (`in_app` or `telephony`) that applies the appropriate defaults, overridable by experience controls.

---

## 14. Error Handling and Resilience

### 14.1 Connection Errors

| Error | Adapter Behaviour | App-Layer Expectation |
|-------|------------------|----------------------|
| WebSocket fails to open | Emit `error` (recoverable: true) | Show retry option |
| WebSocket closes unexpectedly | Emit `error` + `disconnected` (intentional: false) | Offer reconnect |
| Setup handshake times out | Emit `error` (recoverable: true) | Retry with same or fallback provider |
| Provider returns error event | Emit `error` with provider message | Display error; continue if recoverable |
| OpenAI "active response in progress" | Queue `response.create` internally | Transparent to app layer |
| Gemini server error (code 1011/1006) | Emit `error` (recoverable: false) | Session lost; start new |

### 14.2 Provider Failover

The connection layer does NOT implement failover — it connects to one provider per session. Provider failover is an app-layer or platform-layer responsibility:

1. App calls `connect()` with primary provider
2. On `error` (recoverable), app may call `disconnect()` then `connect()` with fallback provider
3. Platform control plane maintains fallback chain configuration per app

### 14.3 Intentional vs Unintentional Close

The adapter tracks whether disconnection was intentional (app called `disconnect()`) or unintentional (WebSocket dropped). This is communicated via the `disconnected` event so the app layer can decide whether to show an error or reconnect.

---

## 15. Testing Strategy

### 15.1 Adapter Unit Tests

Each provider adapter should have unit tests that verify event normalisation using recorded provider message sequences:

- Record actual WebSocket messages from each provider during test sessions
- Replay these messages through the adapter
- Assert the correct normalised events are emitted in the correct order

### 15.2 Integration Tests

| Test | What It Validates |
|------|------------------|
| Connect + triggerResponse + receive audio | End-to-end provider connection |
| Send audio + receive user_transcript | Audio pipeline + VAD + transcription |
| Tool call → respondToToolCall → model continues | Tool calling round-trip |
| Stall recovery fires after timeout | Gemini stall detection |
| Echo guard suppresses audio during playback | Echo suppression timing |
| Turn nudge fires after speech energy | Client-side turn management |
| Session resume with seedContext | Context seeding format |

### 15.3 Provider Compatibility Matrix

Maintain a CI-runnable compatibility check that exercises each provider adapter with a minimal session (connect, one turn, disconnect) and flags any regressions from API changes.

---

## 16. Implementation Priorities

### Phase 1 — Core Connection Layer

1. Define and publish the `VoiceConnection` interface and `NormalizedVoiceEvent` types as an npm package
2. Implement OpenAI adapter (most complete, best documented)
3. Implement audio capture/playback pipeline (framework-agnostic)
4. Implement echo suppression framework
5. Ship: in-app voice via OpenAI with full event normalisation

### Phase 2 — Multi-Provider

6. Implement Gemini adapter (including stall recovery)
7. Implement Grok adapter (including turn nudging)
8. Implement Voice Experience Controls translation layer
9. Implement tool calling abstraction with schema translation
10. Ship: provider selection at session start, controls presets

### Phase 3 — ElevenLabs and Telephony

11. Implement ElevenLabs hybrid adapter (text-only + TTS)
12. Port telephony bridge to use shared adapter interface
13. Implement telephony audio config (G.711 path)
14. Ship: unified adapter interface for in-app and telephony

### Phase 4 — Hardening

15. Provider compatibility CI
16. Recorded message replay test suite per provider
17. Reconnection and failover plumbing
18. Performance profiling (audio latency, event processing overhead)

---

## 17. Document Relationships

| Document | Purpose | Audience |
|----------|---------|----------|
| **voice-infrastructure-prd-v2.md** | Product requirements, positioning, pricing, go-to-market | Product, business, engineering leadership |
| **voice-platform-technical-spec.md** | Multi-tenant architecture, data model, API contracts, deployment | Platform engineering |
| **voice-experience-controls-spec.md** | Voice controls product spec, presets, UX modes | Product, design, engineering |
| **voice-implementation-learnings.md** | Raw learnings from Flank production codebase | Engineering reference (appendix) |
| **This document** | Connection layer build specification | Engineering team building VoiceRails runtime |
| **streaming-transcript-learnings.md** | Transcript UX learnings, Deepgram analysis | Engineering reference |

---

*End of document.*
