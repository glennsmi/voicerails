# Voice Implementation Learnings — Configuration, Provider Specifics, and Platform Extraction Guide

**Version:** 1.0  
**Date:** 2026-03-01  
**Status:** Reference document for VoiceRails platform extraction  
**Source:** Extracted from Flank production codebase and development history

---

## Purpose

This document captures every implementation detail, provider-specific configuration, workaround, and hard-won lesson from building production voice sessions across OpenAI Realtime, Gemini Live, ElevenLabs, and Grok. The intent is to create a complete reference that a connection layer (VoiceRails) can use to abstract provider differences behind a stable API, so that app developers never need to learn these specifics.

---

## 1. Architecture Overview — Current State

### 1.1 Three Deployment Surfaces

The current codebase serves voice through three distinct paths, each with different audio formats, transport mechanisms, and provider configurations:

| Surface | Audio Format | Transport | VAD Config Profile | Provider Support |
|---------|-------------|-----------|-------------------|-----------------|
| **In-App (WebSocket)** | PCM16 @ 16kHz in, PCM16 @ 24kHz out | Browser WebSocket direct to provider | Coaching-tuned (long pauses) | OpenAI, Gemini, ElevenLabs, Grok |
| **Telephony Bridge** | G.711 μ-law @ 8kHz (Twilio native) | Cloud Run WebSocket server | Phone-tuned (fast turns) | OpenAI, Grok |
| **ElevenLabs Hybrid** | PCM16 in (to OpenAI), PCM @ 24kHz out (from ElevenLabs TTS) | Browser WS to OpenAI (text-only) + HTTP TTS | Same as OpenAI with longer echo guard | ElevenLabs via OpenAI transport |

### 1.2 Current Code Locations

| Component | Location | Role |
|-----------|----------|------|
| `useVoiceSession.ts` | `src/hooks/` | All in-app voice logic: WebSocket lifecycle, audio capture/playback, provider message parsing, transcript management, tool call handling, end detection |
| `getVoiceToken.ts` | `functions/src/handlers/` | Session creation, ephemeral token issuance, provider config, VAD parameters, system prompt assembly |
| `synthesizeSpeech.ts` | `functions/src/handlers/` | ElevenLabs TTS endpoint for text-to-speech synthesis |
| `server.ts` | `telephony/src/` | Twilio media stream WebSocket bridge, session lifecycle |
| `providers/openai.ts` | `telephony/src/providers/` | OpenAI telephony adapter |
| `providers/grok.ts` | `telephony/src/providers/` | Grok telephony adapter |
| `providers/base.ts` | `telephony/src/providers/` | Provider interface contract and kickoff prompts |
| `audio-processor.js` | `public/` | AudioWorklet for PCM capture from microphone |

### 1.3 Why This Is Hard to Maintain

The current `useVoiceSession.ts` is ~2,070 lines containing: WebSocket connection management, provider-specific message parsing (4 providers), audio capture/playback, transcript stream management, tool call handling, end-of-session detection, echo suppression, stall recovery, and duplicate response suppression — all in a single React hook. This conflation of connection-layer concerns with app-logic concerns is exactly what VoiceRails must separate.

---

## 2. Audio Pipeline — Precise Configuration

### 2.1 Sample Rates

| Context | Direction | Rate | Format | Notes |
|---------|-----------|------|--------|-------|
| In-app capture | Mic → Provider | 16,000 Hz | PCM16 (Int16) | Browser AudioContext created at 16kHz; AudioWorklet captures Float32, main thread converts to Int16 |
| In-app playback | Provider → Speaker | 24,000 Hz | PCM16 (Int16) | Browser AudioContext at default rate; `createBuffer` at 24kHz; browser resamples to device rate |
| Telephony | Twilio ↔ Provider | 8,000 Hz | G.711 μ-law | Twilio media streams use μ-law natively; OpenAI accepts `g711_ulaw`; Grok accepts `audio/pcmu` |
| ElevenLabs TTS output | Server → Browser | 24,000 Hz | PCM | Requested as `pcm_24000` output format from ElevenLabs API |

### 2.2 Audio Capture Pipeline (In-App)

```
Microphone
  → getUserMedia({ channelCount: 1, sampleRate: 16000,
                   echoCancellation: true, noiseSuppression: true, autoGainControl: true })
  → AudioContext (16kHz)
  → MediaStreamSource
  → AudioWorkletNode ('pcm-processor')
  → Float32 chunks posted to main thread
  → Buffered in sendBuffer (FLUSH_SAMPLES = 2048 samples = ~128ms)
  → Timer-based flush fallback (FLUSH_INTERVAL_MS = 120ms)
  → Float32→Int16 conversion
  → Base64 encoding
  → WebSocket send (provider-specific envelope)
```

**AudioWorklet batching:** The worklet itself batches to 4096 samples (~256ms at 16kHz) before posting. The main thread then applies a secondary buffer with threshold at 2048 samples (~128ms) or a 120ms timer, whichever fires first.

**Key detail:** The worklet is NOT connected to `ctx.destination` — connecting it would create audio feedback by playing the mic back through speakers.

### 2.3 Audio Playback Pipeline (In-App)

```
Base64 from provider
  → atob → Uint8Array → Int16Array
  → Int16→Float32 conversion (÷32768)
  → AudioBuffer at 24kHz (1 channel)
  → AudioBufferSourceNode
  → Connect to ctx.destination
  → Scheduled playback (gapless via nextPlayTime tracking)
```

**Gapless playback:** Each audio chunk is scheduled to start at `max(now, nextPlayTime)`, and `nextPlayTime` is advanced by the buffer's duration. This prevents gaps between audio chunks.

### 2.4 Audio Format Per Provider (WebSocket Envelope)

**OpenAI / ElevenLabs / Grok (in-app):**
```json
{ "type": "input_audio_buffer.append", "audio": "<base64-pcm16>" }
```

**Gemini (in-app):**
```json
{ "realtimeInput": { "audio": { "data": "<base64-pcm16>", "mimeType": "audio/pcm;rate=16000" } } }
```

**OpenAI (telephony):**
```json
{ "type": "input_audio_buffer.append", "audio": "<base64-g711-ulaw>" }
```
Format declared as `g711_ulaw` for both input and output.

**Grok (telephony):**
```json
{ "type": "input_audio_buffer.append", "audio": "<base64-g711-ulaw>" }
```
Format declared as `audio/pcmu` (G.711 μ-law natively, zero resampling with Twilio).

---

## 3. Provider Connection Details

### 3.1 WebSocket URLs and Authentication

| Provider | URL | Auth Mechanism |
|----------|-----|----------------|
| **OpenAI** | `wss://api.openai.com/v1/realtime?model={model}` | WebSocket subprotocols: `['realtime', 'openai-insecure-api-key.{token}', 'openai-beta.realtime-v1']` |
| **Gemini** | `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token={token}` | Query parameter auth token |
| **Grok** | `wss://api.x.ai/v1/realtime` | WebSocket subprotocol: `['xai-client-secret.{token}']` |
| **OpenAI (telephony)** | `wss://api.openai.com/v1/realtime?model={model}` | HTTP header: `Authorization: Bearer {key}`, `OpenAI-Beta: realtime=v1` |
| **Grok (telephony)** | `wss://api.x.ai/v1/realtime` | HTTP header: `Authorization: Bearer {key}` |

### 3.2 Ephemeral Token Issuance

**OpenAI/ElevenLabs:** Backend calls `POST https://api.openai.com/v1/realtime/sessions` with the full session config (model, voice, instructions, tools, VAD, transcription settings). Returns `client_secret.value` (ephemeral token) and `client_secret.expires_at`. The session is pre-configured server-side; the client just connects with the token.

**Gemini:** Backend calls `POST https://generativelanguage.googleapis.com/v1alpha/auth_tokens` with `uses: 1`, `expireTime` (30 min), `newSessionExpireTime` (1 min), and the full `bidiGenerateContentSetup` config. Returns a token `name` string. The client connects with this token but must still send a `setup` message with model and voice config.

**Grok:** No ephemeral token endpoint. The full API key is passed to the client via subprotocol. The client sends `session.update` with all config after connection.

**Key learning:** Gemini requires a two-phase setup: (1) connect with auth token, (2) send setup message and wait for `setupComplete` response. OpenAI pre-configures on token issuance. Grok configures post-connection via `session.update`.

### 3.3 Connection Timeout

All providers use `WS_OPEN_TIMEOUT_MS = 20,000ms` for the initial WebSocket connection. Gemini and Grok have an additional 15,000ms timeout for the setup/configuration handshake after connection opens.

### 3.4 Models and Voices

| Provider | Model | Default Voice | Available Voices |
|----------|-------|---------------|-----------------|
| **OpenAI** | `gpt-realtime` | `alloy` | alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar |
| **Gemini** | `models/gemini-2.5-flash-native-audio-preview-12-2025` | `Kore` | Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr |
| **ElevenLabs** | `gpt-realtime` (OpenAI model, text-only mode) | `21m00Tcm4TlvDq8ikWAM` (Rachel) | Any ElevenLabs voice ID |
| **Grok** | (default model) | `Ara` | Ara, Rex, Sal, Eve, Leo (title-cased) |

**ElevenLabs model note:** ElevenLabs does not have its own realtime model. It uses OpenAI Realtime in `modalities: ['text']` mode (no audio output from the model). The model generates text responses, and the client calls a separate `synthesizeSpeech` Cloud Function to convert text to audio via ElevenLabs TTS (`eleven_flash_v2_5` model, `pcm_24000` output format).

---

## 4. VAD and Turn Detection — The Hardest Configuration Problem

### 4.1 Why This Matters

VAD (Voice Activity Detection) and turn detection determine when the user has "finished speaking" and the AI should respond. Getting this wrong causes:

- **Too aggressive (short silence):** AI interrupts users mid-thought, especially problematic for reflective/coaching use cases where users pause to think.
- **Too conservative (long silence):** Users wait awkwardly after finishing, feeling the system is unresponsive.
- **False positives:** System audio (assistant's own voice) triggers the VAD, creating self-conversation loops.
- **False negatives:** User speech isn't detected, requiring manual turn nudging.

### 4.2 In-App VAD Configuration (Coaching Profile)

These values are tuned for a reflective coaching use case where users need time to think:

**OpenAI:**
```json
{
  "type": "server_vad",
  "threshold": 0.4,
  "prefix_padding_ms": 260,
  "silence_duration_ms": 1500,
  "create_response": true
}
```

**ElevenLabs (via OpenAI transport):**
```json
{
  "type": "server_vad",
  "threshold": 0.4,
  "prefix_padding_ms": 260,
  "silence_duration_ms": 1600,
  "create_response": true
}
```
Slightly longer silence duration to account for the additional latency in the ElevenLabs TTS round-trip.

**Gemini:**
```json
{
  "automaticActivityDetection": {
    "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
    "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
    "silenceDurationMs": 1400,
    "prefixPaddingMs": 220
  }
}
```
`END_SENSITIVITY_LOW` means Gemini waits longer before concluding the user has stopped speaking — critical for coaching where users pause mid-thought.

### 4.3 Telephony VAD Configuration (Phone Profile)

Phone calls need faster turn-taking because users expect phone-call pacing:

**OpenAI (telephony):**
```json
{
  "type": "server_vad",
  "threshold": 0.5,
  "prefix_padding_ms": 120,
  "silence_duration_ms": 350,
  "create_response": true
}
```
Much shorter `silence_duration_ms` (350 vs 1500) and higher `threshold` (0.5 vs 0.4) for snappier phone interactions.

**Grok (telephony):**
```json
{
  "type": "server_vad"
}
```
Grok uses basic server VAD with no fine-grained parameters (at least as of current API).

### 4.4 VAD Parameter Reference

| Parameter | OpenAI Name | Gemini Name | Effect |
|-----------|-------------|-------------|--------|
| Speech detection threshold | `threshold` (0.0-1.0) | `startOfSpeechSensitivity` (HIGH/MEDIUM/LOW) | How loud/clear audio must be to count as speech |
| Silence before end-of-turn | `silence_duration_ms` | `silenceDurationMs` | How long to wait after speech stops before triggering response |
| Audio included before speech onset | `prefix_padding_ms` | `prefixPaddingMs` | How much audio before detected speech to include (captures soft starts) |
| End-of-speech sensitivity | N/A | `endOfSpeechSensitivity` (HIGH/MEDIUM/LOW) | How eagerly to conclude speech has ended (LOW = more patient) |
| Auto-create response | `create_response` (bool) | N/A | Whether to auto-generate a response on turn end |

### 4.5 Client-Side Turn Nudging (Gemini/Grok Only)

OpenAI and ElevenLabs use server-side VAD exclusively — the server decides when the user has finished speaking and auto-creates a response.

Gemini and Grok sometimes fail to detect turn completion from server VAD alone, especially when the user finishes speaking softly. A client-side "turn nudge" timer compensates:

```
TURN_NUDGE_MS = 2800ms after last detected speech energy
```

**Nudge logic:**
1. When audio with speech-like energy is sent, reset the nudge timer to 2800ms.
2. When the timer fires:
   - Skip if no user audio since last turn
   - Skip if assistant is currently speaking
   - Skip if a response just finished within `RESPONSE_COOLDOWN_MS` (4000ms) — prevents echo-triggered loops
   - Skip if `consecutiveDuplicateCount >= DUPLICATE_THRESHOLD` (2) — prevents looping
3. Flush any remaining audio buffer
4. For Grok: send `input_audio_buffer.commit` + `response.create`
5. For Gemini: send `{ clientContent: { turnComplete: true } }`

**Key learning:** The response cooldown (`RESPONSE_COOLDOWN_MS = 4000ms`) is critical. Without it, the model's own audio bleeds through the echo cancellation, gets detected as user speech, triggers a turn nudge, and creates a self-conversation loop. This was the hardest bug to fix.

---

## 5. Echo Suppression and False Input Prevention

### 5.1 The Self-Conversation Problem

The most insidious bug in real-time voice is "self-conversation" — the assistant's audio output gets picked up by the microphone, the VAD detects it as user speech, and the system responds to itself in a loop.

Browser-level `echoCancellation: true` helps but is not sufficient, especially with:
- ElevenLabs (high-quality TTS that sounds human-like to the VAD)
- Speakers at high volume
- Certain device/browser combinations

### 5.2 Multi-Layer Echo Protection

**Layer 1 — Browser Audio Constraints:**
```javascript
navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    sampleRate: 16000,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
```

**Layer 2 — Echo Guard Window (ElevenLabs only by default):**
When assistant audio is playing, suppress user audio processing for the duration of the audio plus a guard period:

```
DEFAULT_ECHO_GUARD_MS = 250ms (OpenAI — applied only via shouldApplyEchoGuard)
ELEVENLABS_ECHO_GUARD_MS = 900ms
```

The echo guard is currently only actively applied for ElevenLabs (`shouldApplyEchoGuard()` returns true only for ElevenLabs). For OpenAI, the echo guard constant exists but is not applied during audio send — only after `response.done`.

**Why ElevenLabs needs a longer guard:** The text-only transport + separate TTS round-trip means there's a gap between when the model finishes generating text and when TTS audio finishes playing. The echo guard must cover this entire window.

**Layer 3 — Local Speech Energy Detection:**
Before accepting any user transcript, check if there was recent genuine local speech:

```
LOCAL_SPEECH_RMS_THRESHOLD = 0.011
LOCAL_SPEECH_PEAK_THRESHOLD = 0.07
LOCAL_SPEECH_RECENCY_MS = 5000ms
```

`hasSpeechLikeEnergy(samples)` checks RMS and peak amplitude of each audio chunk. `hasRecentLocalSpeechEnergy()` checks if any speech-like energy was detected within the last 5 seconds.

**Layer 4 — Short Transcript Rejection (ElevenLabs):**
For ElevenLabs specifically, if a completed user transcript has 2 or fewer words AND there was no recent local speech energy, drop it entirely. This catches echo/noise fragments that slip through other layers.

**Layer 5 — Echo Guard on Speech Started:**
The `input_audio_buffer.speech_started` event is ignored if the system is within the echo guard window, preventing phantom user bubbles from appearing during assistant playback.

**Layer 6 — Post-Response Echo Guard:**
After `response.done`, an additional echo guard window is applied (for ElevenLabs) to suppress any trailing audio:
```javascript
suppressUserAudioUntilRef.current = Math.max(
  suppressUserAudioUntilRef.current,
  Date.now() + echoGuardMs
);
```

### 5.3 Mapping to Platform Controls

These mechanisms map to the Voice Experience Controls spec:

| Platform Control | Implementation |
|-----------------|----------------|
| **False Input Guard** | Echo guard window duration + speech energy threshold + short transcript rejection |
| **Interruption Sensitivity** | VAD threshold + prefix_padding_ms |
| **Pause Tolerance** | silence_duration_ms + endOfSpeechSensitivity |

---

## 6. Transcript Management — Single-Bubble Architecture

### 6.1 The Problem

Provider events arrive in fragments. Without careful management, a single assistant response creates 3-4 chat bubbles:
1. `response.audio_transcript.delta` events (multiple fragments)
2. `response.audio_transcript.done` (consolidated)
3. `response.text.done` (text-channel duplicate)
4. `response.done` (cleanup flush)

### 6.2 Stream-Key-Based Upsert/Finalize Model

Every transcript entry is managed by a **stream key** that ensures one bubble per turn:

**User stream keys:** Derived from `item_id` + `content_index` from provider events, or a fallback `'user-live'`. For Gemini: sequential `'gemini-user-{counter}'`.

**Assistant stream keys:** Derived from `response_id` (OpenAI/Grok/ElevenLabs) — all output for one response shares one key. For Gemini: sequential `'gemini-assistant-{counter}'`.

**Operations:**
- `upsertStreamingTranscript(role, key, text)` — Create or update a bubble. Marks it `isStreaming: true`.
- `finalizeStreamingTranscript(role, key, text)` — Lock the bubble with final text. Marks `isStreaming: false`. Prevents re-opening via `completedStreamKeys` set.
- `removeStreamingTranscript(role, key)` — Remove a bubble entirely (used when echo guard rejects a transcript).

### 6.3 Channel Guard (Audio vs Text Deduplication)

OpenAI can send both audio transcript and text transcript for the same response. The channel guard ensures only one channel is processed per response:

```typescript
function shouldHandleAssistantChannel(streamKey: string, channel: 'audio' | 'text'): boolean
```

Logic: First channel to arrive for a stream key wins. Exception: audio channel can upgrade from text (because audio transcript is higher quality), but text cannot override audio.

### 6.4 Contiguous User Turn Merging

When OpenAI sends multiple `input_audio_transcription.completed` events for what the user perceives as one utterance, consecutive user entries are merged:

```typescript
function mergeTranscriptText(previousText: string, nextText: string): string
```

Handles: exact duplicates, substring containment (previous ends with next, next starts with previous), and concatenation. The placeholder `'...'` is replaced by real text.

### 6.5 Duplicate Transcript Window

To prevent the same text appearing twice in quick succession:

```
DUPLICATE_TRANSCRIPT_WINDOW_MS = 8000ms
```

If the last transcript entry has the same role and normalized text within 8 seconds, skip it.

### 6.6 User Bubble on Speech Start

When `input_audio_buffer.speech_started` fires, a placeholder user bubble is created immediately with `'...'` text. This ensures the user's bubble is visible before the transcription arrives (which only comes after speech ends). The placeholder is later replaced by the actual transcript via `upsertStreamingTranscript`.

---

## 7. Provider-Specific Event Schemas

### 7.1 Event Name Differences

This is the most fragile area — each provider uses slightly different event names for equivalent actions:

| Concept | OpenAI | Grok | Gemini |
|---------|--------|------|--------|
| **Assistant audio chunk** | `response.audio.delta` | `response.output_audio.delta` | `serverContent.modelTurn.parts[].inlineData.data` |
| **Assistant transcript delta** | `response.audio_transcript.delta` | `response.output_audio_transcript.delta` | `outputTranscription.text` (or `serverContent.outputTranscription.text`) |
| **Assistant transcript done** | `response.audio_transcript.done` | `response.output_audio_transcript.done` | N/A (finalized on `turnComplete`) |
| **User transcript delta** | `conversation.item.input_audio_transcription.delta` | N/A | `inputTranscription.text` (or `serverContent.inputTranscription.text`) |
| **User transcript final** | `conversation.item.input_audio_transcription.completed` | `conversation.item.input_audio_transcription.completed` | N/A (finalized on `turnComplete`) |
| **Speech detected** | `input_audio_buffer.speech_started` | N/A | N/A |
| **Turn complete** | `response.done` | `response.done` | `serverContent.turnComplete: true` |
| **Interrupted** | N/A | N/A | `serverContent.interrupted: true` |
| **Tool call complete** | `response.output_item.done` (item.type=function_call) | `response.function_call_arguments.done` | `toolCall.functionCalls[]` (or `tool_call.function_calls[]`) |
| **Tool call response** | `conversation.item.create` (function_call_output) | `conversation.item.create` (function_call_output) | `toolResponse.functionResponses[]` |
| **Session configured** | N/A (pre-configured via token) | `session.updated` | `setupComplete` |
| **Text output delta** | `response.text.delta` | N/A | N/A |
| **Text output done** | `response.text.done` | N/A | N/A |
| **Response created** | `response.created` | N/A | N/A |
| **Error** | `error` (type field) | `error` (type field) | `error` or `goAway` |

### 7.2 Gemini-Specific Quirks

**Transcript location:** Gemini sends transcription data in two possible locations:
1. Top-level: `msg.inputTranscription.text` / `msg.outputTranscription.text`
2. Nested: `msg.serverContent.inputTranscription.text` / `msg.serverContent.input_transcription.text`

Both must be handled (camelCase and snake_case variants).

**Control character artifacts:** Gemini sometimes produces `<ctrl46>` or `[ctrl46]`-style tags in transcripts. These must be sanitized:
```typescript
function sanitizeGeminiTranscript(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')       // strip HTML/XML-like tags
    .replace(/\[ctrl\d+\]/gi, '')  // strip [ctrl46]-style sequences
    .replace(/\u0000/g, '')        // strip null bytes
    .trim();
}
```

**Turn lifecycle:** Gemini uses `turnComplete` and `interrupted` in `serverContent` instead of distinct event types. All partial transcripts (user and assistant) must be flushed/finalized when `turnComplete` arrives. When `interrupted`, the playback queue must be cleared and all streaming state reset.

**Setup message required:** Even though the auth token request includes `bidiGenerateContentSetup`, the client must still send a `setup` message with model and voice config after connection opens, then wait for `setupComplete`.

**Audio delivery:** Gemini sends audio inline in `serverContent.modelTurn.parts[].inlineData.data` rather than as dedicated audio events.

### 7.3 Grok-Specific Quirks

**Event name differences:** Grok prefixes audio events with `output_`:
- `response.output_audio.delta` (not `response.audio.delta`)
- `response.output_audio_transcript.delta` (not `response.audio_transcript.delta`)

**Tool call event:** Grok uses `response.function_call_arguments.done` as a flat event with `name`, `arguments`, and `call_id` at the top level, whereas OpenAI nests the tool call inside `response.output_item.done` → `item.type === 'function_call'`.

**Audio format names:** For telephony, Grok uses `audio/pcmu` as the format name (not `g711_ulaw` like OpenAI).

**Session config:** Grok uses a nested `audio.input.format` / `audio.output.format` structure:
```json
{
  "audio": {
    "input": { "format": { "type": "audio/pcm", "rate": 16000 } },
    "output": { "format": { "type": "audio/pcm", "rate": 24000 } }
  }
}
```
Compare to OpenAI's flat `input_audio_format: 'pcm16'`, `output_audio_format: 'pcm16'`.

**Voice name casing:** Grok voices are title-cased (Ara, Rex, Sal, Eve, Leo). Input must be normalized.

### 7.4 ElevenLabs — Hybrid Transport Architecture

ElevenLabs is not a standalone realtime provider. The current architecture:

1. Uses OpenAI Realtime in **text-only mode** (`modalities: ['text']`) for conversation intelligence, VAD, and transcription.
2. When OpenAI produces a text response (`response.audio_transcript.done` or `response.text.done`), the text is sent to a backend Cloud Function.
3. The Cloud Function calls ElevenLabs TTS API (`eleven_flash_v2_5` model) to synthesize speech.
4. The audio is returned as base64 PCM @ 24kHz and played back on the client.

**Implications:**
- Higher latency (model generation + network round-trip + TTS generation)
- No audio output from the OpenAI session itself (no `response.audio.delta`)
- Requires longer echo guard (900ms vs 250ms)
- No voice selection in the OpenAI session config (voice is set on the ElevenLabs TTS call)
- Text channel handling must be enabled (`response.text.delta`/`response.text.done`)

**TTS Configuration:**
```
Endpoint: POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream?output_format=pcm_24000
Model: eleven_flash_v2_5
Default Voice ID: 21m00Tcm4TlvDq8ikWAM (Rachel)
Output: pcm_24000 (raw PCM, 24kHz, 16-bit)
```

---

## 8. Tool Calling Across Providers

### 8.1 Tool Declaration Formats

Each provider expects a different schema format for tool/function declarations:

**OpenAI (in session config):**
```json
{
  "type": "function",
  "name": "add_insight",
  "description": "...",
  "parameters": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": [...] },
      "content": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["type", "content", "confidence"]
  }
}
```

**Gemini (in bidiGenerateContentSetup):**
```json
{
  "tools": [{
    "functionDeclarations": [{
      "name": "add_insight",
      "description": "...",
      "parameters": {
        "type": "OBJECT",
        "properties": {
          "type": { "type": "STRING", "enum": [...] },
          "content": { "type": "STRING" },
          "confidence": { "type": "NUMBER" }
        },
        "required": ["type", "content", "confidence"]
      }
    }]
  }]
}
```
Note: Gemini uses uppercase type names (`OBJECT`, `STRING`, `NUMBER`).

**Grok (in session.update):**
Same format as OpenAI (lowercase types).

### 8.2 Tool Call Event Handling

**OpenAI — Two event paths exist:**

Path 1 (standard): `response.output_item.done` where `item.type === 'function_call'`
- Arguments in `item.arguments` (string, needs JSON.parse)
- Call ID in `item.call_id`

Path 2 (newer/ElevenLabs): `response.function_call_arguments.done`
- Arguments in `msg.arguments` (string)
- Name in `msg.name`
- Call ID in `msg.call_id`

Both paths must be handled.

**Grok:** `response.function_call_arguments.done`
- Arguments in `msg.arguments` (string)
- Name in `msg.name`
- Call ID in `msg.call_id`

**Gemini:** `msg.toolCall` or `msg.tool_call` (both camelCase and snake_case)
- Contains `functionCalls` or `function_calls` (array)
- Each has `id`, `name`, `args` (object, NOT string — no JSON.parse needed)

### 8.3 Tool Call Response Patterns

**OpenAI/Grok:**
1. Send `conversation.item.create` with `type: 'function_call_output'`, `call_id`, and `output` (JSON string)
2. Send `response.create` to trigger the model to continue

**Important:** OpenAI tracks "response in progress" state. If a `response.create` is sent while a response is already active, it returns an error. The implementation queues `response.create` and sends it after `response.done`:
```typescript
function requestOpenAiResponse() {
  if (openAiResponseInProgressRef.current) {
    queuedOpenAiResponseCreateRef.current = true;
    return;
  }
  ws.send(JSON.stringify({ type: 'response.create' }));
  openAiResponseInProgressRef.current = true;
}
```

**Gemini:**
```json
{ "toolResponse": { "functionResponses": [{ "id": "...", "name": "...", "response": { "result": "recorded" } }] } }
```
Multiple tool responses can be batched into one message.

### 8.4 Deduplication of Handled Tool Calls

A `Set<string>` of handled call IDs prevents double-processing:
```typescript
const handledToolCallIdsRef = useRef<Set<string>>(new Set());
```
This is essential because some providers can emit the same tool call completion event more than once.

---

## 9. Gemini Stall Recovery

### 9.1 The Problem

Gemini Live occasionally "stalls" — the user speaks, the audio is sent, but the model never responds. No `turnComplete`, no audio output, no error. The session hangs silently.

### 9.2 Recovery Mechanism

A stall recovery timer monitors for inactivity after user speech:

```
GEMINI_STALL_TIMEOUT_MS = 8000ms (time without activity before first recovery attempt)
GEMINI_STALL_RETRY_MS = 5000ms (interval between retry attempts)
GEMINI_STALL_MAX_RETRIES = 2 (max nudge attempts before giving up)
```

**Logic:**
1. Whenever speech-like energy is detected, start the stall timer.
2. Track last Gemini activity (audio output or transcript).
3. If `GEMINI_STALL_TIMEOUT_MS` passes without activity:
   - Don't nudge if assistant is speaking or has an active stream
   - Send `{ clientContent: { turnComplete: true } }` as a recovery nudge
   - Retry up to `GEMINI_STALL_MAX_RETRIES` times
4. Clear the timer on `turnComplete` or `interrupted`.

**Activity tracking:** `markGeminiActivity()` is called whenever audio or transcript output arrives from Gemini.

---

## 10. Grok Duplicate Response Suppression

### 10.1 The Problem

Grok can enter a loop where it repeats the same response verbatim. This happens when:
1. Turn nudge triggers a response
2. The response is identical to the previous one
3. The turn nudge timer fires again after the response
4. Another identical response is generated

### 10.2 Suppression Logic

```
DUPLICATE_THRESHOLD = 2 (consecutive identical responses before suppression)
RESPONSE_COOLDOWN_MS = 4000ms (cooldown after response.done before accepting turn nudges)
```

Track the last assistant response text and count consecutive duplicates:
```typescript
if (finalText === lastAssistantResponseTextRef.current) {
  consecutiveDuplicateCountRef.current++;
  if (consecutiveDuplicateCountRef.current >= DUPLICATE_THRESHOLD) {
    // Suppress — don't show or finalize this response
    return;
  }
}
```

The counter is reset when genuine user speech is detected (via `input_audio_transcription.completed`).

The turn nudge timer also checks `consecutiveDuplicateCountRef.current >= DUPLICATE_THRESHOLD` before sending a nudge.

---

## 11. End-of-Session Detection

### 11.1 Three-Layer Detection

The system detects session endings through three independent signal layers:

**Layer 1 — Explicit User Intent:**
Regex patterns matching phrases like "end the session", "I'm done", "that's all", "wrap up":
```typescript
const END_SESSION_INTENT_PATTERNS = [
  /\b(end|finish|stop|close|wrap(?:\s+up)?)\b[\s\w]{0,30}\b(session|conversation|chat|call|here)\b/i,
  // ... 7 patterns total
];
```

**Layer 2 — User Farewell Language:**
Natural farewell phrases like "goodnight", "bye", "speak tomorrow", "take care":
```typescript
const USER_FAREWELL_PATTERNS = [
  /\b(good\s*night|night\s*night|nighty?\s*night|g'?night)\b/i,
  // ... 10 patterns total
];
```

**Layer 3 — Coach Farewell Language:**
Coach/assistant farewell patterns like "have a great day", "take care", "see you next time", "rest well":
```typescript
const COACH_FAREWELL_PATTERNS = [
  /\b(have\s+a\s+(great|good|wonderful|lovely)\s+(day|evening|morning|night|one|rest))\b/i,
  // ... 25 patterns total
];
```

### 11.2 Detection Flow

1. User says something matching `END_SESSION_INTENT_PATTERNS` or `USER_FAREWELL_PATTERNS`:
   - Set `userEndIntentDetectedRef = true`
   - Call `onEndIntent(utterance)` callback (shows confirmation modal)
   - Cooldown: `END_INTENT_COOLDOWN_MS = 4000ms` before another trigger

2. Coach responds with farewell matching `COACH_FAREWELL_PATTERNS`:
   - If `userEndIntentDetected` is already true: call `onAutoEnd()` (auto-close session)
   - If not: call `onEndIntent(text)` (show modal — the coach is wrapping up independently)
   - Same cooldown applies

3. Text normalization before matching:
   ```typescript
   function normalizeIntentText(text: string): string {
     return text.toLowerCase()
       .replace(/[\u2018\u2019]/g, '\'')
       .replace(/[\u201c\u201d]/g, '"')
       .replace(/[^a-z0-9'\s]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();
   }
   ```

### 11.3 Key Lesson: Streaming-Safe Detection

Intent detection must only run on **finalized** transcripts, not on streaming deltas. Running it on partial text causes false triggers when a word like "good" appears mid-sentence before "good morning" is complete. The `suppressIntent: true` flag is passed to `upsertStreamingTranscript` and `appendTranscript` during streaming operations.

Intent signals are checked in `handleTranscriptIntentSignals()` which is called by `finalizeStreamingTranscript()` (after the final text is locked) and by `appendTranscript()` (when not suppressed).

---

## 12. Session Continuity (Resume)

### 12.1 Transcript Seeding

When resuming a session, previous messages are loaded from Firestore and injected into the provider context:

```
RESUME_SEED_MESSAGE_LIMIT = 40 (max messages to seed)
```

**OpenAI/ElevenLabs/Grok:** Each message is sent as `conversation.item.create` with `type: 'message'`:
```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user|assistant",
    "content": [{ "type": "input_text", "text": "..." }]
  }
}
```

**Gemini:** All messages are sent in a single `clientContent` message with `turns` array:
```json
{
  "clientContent": {
    "turns": [
      { "role": "user", "parts": [{ "text": "..." }] },
      { "role": "model", "parts": [{ "text": "..." }] }
    ],
    "turnComplete": true
  }
}
```
Note: Gemini uses `"model"` instead of `"assistant"` for the AI role.

### 12.2 Resume Prompt

When continuing a session, a different kickoff prompt is used:
```
"Continue this conversation from where it paused. Briefly acknowledge the last topic, then ask one focused follow-up question."
```

### 12.3 Modality Tracking

Session modality transitions on resume:
- `text` → `mixed` (was text, now adding voice)
- `mixed` → `mixed` (stays mixed)
- `voice` → `voice` (stays voice)
- New session → `voice`

---

## 13. Telephony Bridge Architecture

### 13.1 Deployment

The telephony bridge is a standalone Node.js WebSocket server deployed on Cloud Run. It receives Twilio Media Stream WebSocket connections and bridges them to voice providers.

**Endpoint:** `wss://{bridge-url}/media-stream`
**Health check:** `GET /health` → `{ "ok": true }`

### 13.2 Session Lifecycle

1. **Twilio `start` event** → Extract `userId`, `sessionType`, `trigger`, `provider` from custom parameters → Call `bridgeStartSession` API → Get session config → Create provider adapter → Start provider WebSocket
2. **Twilio `media` events** → Forward base64 μ-law audio directly to provider adapter
3. **Provider audio output** → Send back to Twilio as media event with `streamSid`
4. **Twilio `stop` event** or socket close → Call `bridgeFinalizeSession` with transcript, extractions, and usage data

### 13.3 Provider Adapter Pattern

The telephony bridge already has a clean adapter interface:

```typescript
interface RealtimeProviderAdapter {
  readonly id: VoiceProvider;
  start(input: ProviderStartInput): Promise<void>;
  onTwilioAudio(payloadBase64Mulaw: string): void;
  stop(): void;
}

interface ProviderCallbacks {
  onAssistantAudioMulaw: (payloadBase64: string) => void;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
  onExtraction: (extraction: RealtimeExtraction) => void;
  onError: (message: string) => void;
}
```

This is the closest existing code to what the VoiceRails connection layer should look like. The in-app voice code (`useVoiceSession.ts`) should be refactored to use a similar adapter pattern.

### 13.4 Provider Fallback in Telephony

ElevenLabs falls back to OpenAI adapter for telephony (since ElevenLabs doesn't support direct audio streaming). Gemini is not implemented for telephony. Unknown providers fall back to the configured `DEFAULT_REALTIME_PROVIDER`.

### 13.5 Twilio Audio Format

Twilio Media Streams send G.711 μ-law audio. This is passed through to providers that support it natively (OpenAI via `g711_ulaw`, Grok via `audio/pcmu`). No resampling or format conversion is needed in the bridge.

TwiML for media streaming includes custom parameters:
```xml
<Connect>
  <Stream url="{bridge-ws-url}">
    <Parameter name="userId" value="{userId}" />
    <Parameter name="sessionType" value="{sessionType}" />
    <Parameter name="trigger" value="{trigger}" />
  </Stream>
</Connect>
```

---

## 14. Text Input During Voice Sessions

Users can type messages during voice sessions via a "Type instead" input. Text messages bypass the audio pipeline entirely:

**OpenAI/ElevenLabs/Grok:**
```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user",
    "content": [{ "type": "input_text", "text": "..." }]
  }
}
```
Followed by `response.create`.

**Gemini:**
```json
{
  "clientContent": {
    "turns": [{ "role": "user", "parts": [{ "text": "..." }] }],
    "turnComplete": true
  }
}
```

---

## 15. Session Cleanup and Resource Management

### 15.1 Resource Teardown Order

```
1. Set intentionalClose flag (prevents error UI on expected close)
2. Disconnect AudioWorklet
3. Stop all MediaStream tracks
4. Clear all timers (flush, nudge, speaking, auto-end, stall)
5. Close WebSocket
6. Close AudioContexts (capture + playback)
7. Reset all refs to initial state
```

### 15.2 Unmount Safety

A `isUnmountedRef` flag prevents state updates after the React component unmounts. The `useEffect` cleanup calls `suppressVoiceRuntime()` to tear down everything. Multiple checkpoints during async `startSession` verify the component hasn't unmounted before proceeding.

### 15.3 Post-Session Processing

After `end()` is called:
1. Transcript is saved to Firestore (each entry as a message document)
2. Session status set to `'extracting'`
3. `callProcessExtraction(sessionId)` runs belief graph extraction
4. Status transitions to `'completed'`
5. All this happens in background — user sees `'completed'` immediately

---

## 16. Configuration Values Summary — Quick Reference

### Audio Constants
| Constant | Value | Purpose |
|----------|-------|---------|
| `SEND_SAMPLE_RATE` | 16000 | Mic capture sample rate |
| `RECV_SAMPLE_RATE` | 24000 | Playback sample rate |
| `FLUSH_SAMPLES` | 2048 | Audio buffer flush threshold (~128ms @ 16kHz) |
| `FLUSH_INTERVAL_MS` | 120 | Timer-based audio flush fallback |
| `AudioWorklet._flushAt` | 4096 | Worklet-level batch size (~256ms @ 16kHz) |

### Turn Management
| Constant | Value | Purpose |
|----------|-------|---------|
| `TURN_NUDGE_MS` | 2800 | Client-side turn nudge delay (Gemini/Grok only) |
| `RESPONSE_COOLDOWN_MS` | 4000 | Cooldown after response before accepting nudges |
| `DUPLICATE_THRESHOLD` | 2 | Max consecutive identical responses before suppression |
| `GEMINI_STALL_TIMEOUT_MS` | 8000 | Time without activity before stall recovery |
| `GEMINI_STALL_RETRY_MS` | 5000 | Interval between stall recovery attempts |
| `GEMINI_STALL_MAX_RETRIES` | 2 | Max stall recovery attempts |

### Echo/False Input Prevention
| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_ECHO_GUARD_MS` | 250 | Echo guard window (OpenAI post-response only) |
| `ELEVENLABS_ECHO_GUARD_MS` | 900 | Extended echo guard for ElevenLabs |
| `LOCAL_SPEECH_RMS_THRESHOLD` | 0.011 | RMS threshold for speech energy detection |
| `LOCAL_SPEECH_PEAK_THRESHOLD` | 0.07 | Peak amplitude threshold |
| `LOCAL_SPEECH_RECENCY_MS` | 5000 | Window for "recent" speech energy |

### Transcript Management
| Constant | Value | Purpose |
|----------|-------|---------|
| `DUPLICATE_TRANSCRIPT_WINDOW_MS` | 8000 | Dedup window for identical transcript entries |
| `RESUME_SEED_MESSAGE_LIMIT` | 40 | Max messages seeded on session resume |

### Session Lifecycle
| Constant | Value | Purpose |
|----------|-------|---------|
| `WS_OPEN_TIMEOUT_MS` | 20000 | WebSocket connection timeout |
| `END_INTENT_COOLDOWN_MS` | 4000 | Cooldown between end-intent triggers |

---

## 17. Normalized Event Schema — Platform Extraction Target

Based on all provider-specific event handling above, the platform connection layer should normalize all provider events into this unified schema:

```typescript
type NormalizedVoiceEvent =
  | { type: 'session_ready' }
  | { type: 'user_speech_started' }
  | { type: 'user_transcript_partial'; text: string; streamKey: string }
  | { type: 'user_transcript_final'; text: string; streamKey: string }
  | { type: 'assistant_transcript_partial'; text: string; streamKey: string }
  | { type: 'assistant_transcript_final'; text: string; streamKey: string }
  | { type: 'assistant_audio'; audioBase64: string; sampleRate: number }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'turn_complete' }
  | { type: 'interrupted' }
  | { type: 'response_in_progress' }
  | { type: 'error'; code: string; message: string; recoverable: boolean };
```

The connection layer handles:
- Provider WebSocket URL, auth, and setup handshake
- Audio format conversion and encoding
- Provider-specific event parsing and normalization
- VAD parameter translation
- Tool call schema translation and response routing
- Stall detection and recovery
- Echo suppression coordination

The app layer handles:
- Transcript UI rendering and bubble management
- End-of-session intent detection
- Session state management (Firestore, extraction, etc.)
- Business-specific tool call processing
- User preferences and settings
- Duplicate response suppression (policy decision)

---

## 18. What a Clean Connection Layer API Looks Like

Based on the telephony bridge adapter pattern (which is already well-separated), the in-app connection layer should expose:

```typescript
interface VoiceConnection {
  connect(config: VoiceConnectionConfig): Promise<void>;
  disconnect(): void;
  sendAudio(pcm16Base64: string): void;
  sendText(text: string): void;
  respondToToolCall(callId: string, output: string): void;

  on(event: 'ready', handler: () => void): void;
  on(event: 'user_speech_started', handler: () => void): void;
  on(event: 'user_transcript', handler: (data: { text: string; streamKey: string; isFinal: boolean }) => void): void;
  on(event: 'assistant_transcript', handler: (data: { text: string; streamKey: string; isFinal: boolean }) => void): void;
  on(event: 'assistant_audio', handler: (data: { audioBase64: string; sampleRate: number }) => void): void;
  on(event: 'tool_call', handler: (data: { callId: string; name: string; args: Record<string, unknown> }) => void): void;
  on(event: 'turn_complete', handler: () => void): void;
  on(event: 'interrupted', handler: () => void): void;
  on(event: 'error', handler: (data: { message: string; recoverable: boolean }) => void): void;
}

interface VoiceConnectionConfig {
  provider: 'openai' | 'gemini' | 'elevenlabs' | 'grok';
  token: string;
  model: string;
  voice: string;
  systemPrompt: string;
  tools: ToolDeclaration[];
  vadProfile: VadProfile;
  audioConfig: {
    inputSampleRate: number;
    outputSampleRate: number;
    inputFormat: 'pcm16' | 'g711_ulaw';
    outputFormat: 'pcm16' | 'g711_ulaw';
  };
  resumeContext?: { role: string; text: string }[];
}
```

This keeps the connection layer self-contained with no knowledge of React state, transcript bubbles, Firestore, billing, or session types.

---

## 19. Known Limitations and Future Considerations

### 19.1 User Transcript Streaming During Speech

Real-time word-by-word user transcript display (like Otter.ai) is not possible with any current voice provider. All providers (OpenAI, Gemini, Grok) only transcribe user input after VAD detects speech has ended. See `streaming-transcript-learnings.md` for the full analysis and the Deepgram parallel transcription solution design.

### 19.2 Gemini Not Supported for Telephony

Gemini Live does not support G.711 μ-law audio format. Supporting Gemini for telephony would require real-time audio resampling/transcoding in the bridge, adding complexity and latency.

### 19.3 ElevenLabs Latency

The text-only transport + separate TTS call adds significant latency compared to native audio providers. Time-to-first-audio is meaningfully higher. Consider whether the platform should support an ElevenLabs WebSocket streaming TTS option to reduce this.

### 19.4 Provider API Instability

All three primary providers (OpenAI, Gemini, Grok) have made breaking or semi-breaking changes to their realtime APIs during the development period. The adapter pattern and event normalization are essential defenses against this.

### 19.5 Grok Disabled in Production

Grok is currently disabled in the settings UI (`PROVIDER_OPTIONS` has `enabled: false` for Grok) despite having full in-app and telephony adapter implementations. This is a maturity/stability decision, not a technical limitation.

---

*End of document.*
