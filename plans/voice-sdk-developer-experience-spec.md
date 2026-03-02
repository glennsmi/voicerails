# VoiceRails — SDK and Developer Experience Specification

**Version:** 1.0  
**Date:** 2026-03-01  
**Status:** Draft  
**Companion to:** `voice-infrastructure-prd-v2.md` (product), `voice-platform-implementation-guide.md` (connection layer internals)

---

## 1. Purpose

This document specifies the developer-facing surface of VoiceRails — what customers see, import, and write code against. It bridges the gap between the PRD (what the product does) and the implementation guide (how the internals work) by defining the public SDK API, workflow format, webhook contracts, CLI, and the end-to-end integration flow.

An engineer reading the PRD + implementation guide + this document should have everything needed to build VoiceRails as a standalone product in a new repository.

---

## 2. The 30-Minute Developer Journey

The PRD targets "zero to first live call in under 30 minutes." This section defines what that journey looks like, step by step. Every API, SDK method, and CLI command in this document supports this flow.

### 2.1 Minute 0–5: Sign Up and Create App

```
1. Developer signs up at voicerails.dev (Google or GitHub SSO)
2. Dashboard → Create App → enters name, selects region
3. Dashboard → Add Provider → pastes OpenAI API key
4. Dashboard → copies API key (vr_live_...)
```

### 2.2 Minute 5–15: First In-App Voice Session

```bash
npm install @voicerails/sdk
```

```typescript
import { VoiceRails } from '@voicerails/sdk';

const vr = new VoiceRails({ apiKey: 'vr_live_...' });

// Start a voice session
const session = await vr.sessions.create({
  provider: 'openai',
  voice: 'alloy',
  systemPrompt: 'You are a friendly intake assistant. Gather the caller\'s name and reason for calling.',
  tools: [
    {
      name: 'capture_intake',
      description: 'Record the caller intake information.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Caller name' },
          reason: { type: 'string', description: 'Reason for calling' },
        },
        required: ['name', 'reason'],
      },
    },
  ],
  experienceControls: 'balanced_assistant', // preset name or custom object
});

// Connect to the session (browser — handles mic, playback, WebSocket)
const connection = await session.connect();

// Handle events
connection.on('assistant_audio', ({ audioBase64, sampleRate }) => {
  // SDK provides built-in playback, or pipe to custom player
});

connection.on('assistant_transcript', ({ text, isFinal }) => {
  updateChatBubble(text, isFinal);
});

connection.on('user_transcript', ({ text, isFinal }) => {
  updateChatBubble(text, isFinal);
});

connection.on('tool_call', async ({ callId, name, args }) => {
  if (name === 'capture_intake') {
    await saveToDatabase(args);
    connection.respondToToolCall(callId, { result: 'saved' });
  }
});

connection.on('turn_complete', () => {
  console.log('Model finished speaking');
});

// When done
await connection.disconnect();
```

### 2.3 Minute 15–25: Add Phone Calling

```typescript
// Provision a phone number
const number = await vr.telephony.numbers.provision({
  country: 'US',
  type: 'local',
  areaCode: '415',
});

// Assign to a workflow
await vr.telephony.numbers.assign(number.id, {
  workflowId: 'intake-flow',
  environment: 'production',
});

// Or trigger an outbound call
const call = await vr.calls.create({
  to: '+14155551234',
  from: number.e164,
  workflowId: 'intake-flow',
});
```

### 2.4 Minute 25–30: View Results

```
Dashboard → Sessions → see transcript, tool call results, duration, cost
Dashboard → Analytics → provider latency, call volume, cost breakdown
```

---

## 3. SDK Architecture

### 3.1 Package Structure

```
@voicerails/sdk          — Primary SDK (browser + Node.js)
@voicerails/react        — React hooks and components (optional)
@voicerails/node         — Node.js-only utilities (webhooks, server-side calls)
voicerails-python        — Python SDK (pip install voicerails)
```

### 3.2 SDK Layers

```
┌─────────────────────────────────────┐
│         @voicerails/sdk             │
│                                     │
│  VoiceRails (client)                │
│  ├── sessions      (create, list)   │
│  ├── calls         (outbound)       │
│  ├── telephony     (numbers)        │
│  ├── workflows     (CRUD)           │
│  ├── analytics     (usage, cost)    │
│  └── webhooks      (registration)   │
│                                     │
│  VoiceConnection (per session)      │
│  ├── connect / disconnect           │
│  ├── sendAudio / sendText           │
│  ├── respondToToolCall              │
│  ├── on(event, handler)             │
│  └── Built-in audio capture/play    │
└────────────────┬────────────────────┘
                 │
    ┌────────────┴────────────┐
    │  Connection Layer       │
    │  (internal, not public) │
    │  Provider adapters      │
    │  Event normalization    │
    │  VAD translation        │
    │  Echo suppression       │
    └─────────────────────────┘
```

The SDK is a thin public API layer over the connection layer defined in the implementation guide. The connection layer is internal — developers never interact with provider adapters directly.

### 3.3 Browser vs Node.js

| Capability | Browser | Node.js |
|-----------|---------|---------|
| `sessions.create()` | Yes | Yes |
| `session.connect()` (WebSocket + mic) | Yes | No (use `session.connectServer()`) |
| `session.connectServer()` (WebSocket, no mic) | No | Yes |
| `calls.create()` (outbound) | Yes (via API) | Yes (via API) |
| `telephony.*` | Yes (via API) | Yes (via API) |
| `workflows.*` | Yes (via API) | Yes (via API) |
| Built-in mic capture | Yes | No |
| Built-in audio playback | Yes | No |
| Webhook signature verification | No | Yes (`@voicerails/node`) |

---

## 4. SDK API Reference

### 4.1 Client Initialisation

```typescript
import { VoiceRails } from '@voicerails/sdk';

const vr = new VoiceRails({
  apiKey: string;               // Required. API key from dashboard.
  environment?: string;         // 'production' (default) | 'staging' | 'development'
  region?: string;              // 'europe-west2' (default)
  baseUrl?: string;             // Override API endpoint (for self-hosted)
});
```

### 4.2 Sessions

```typescript
// Create a session (returns config, does not connect yet)
const session = await vr.sessions.create({
  provider?: VoiceProvider;              // 'openai' | 'gemini' | 'elevenlabs' | 'grok'
  voice?: string;                        // Provider-specific voice name/ID
  systemPrompt: string;                  // Instructions for the model
  tools?: ToolDeclaration[];             // Tool/function declarations
  experienceControls?: string | ExperienceControls;  // Preset name or custom object
  workflowId?: string;                   // Use a saved workflow instead of inline config
  channel?: 'in_app' | 'telephony';      // Affects VAD defaults
  metadata?: Record<string, string>;     // Custom metadata attached to session
  endUserId?: string;                    // Your user's ID (for memory/continuity)
  continueSessionId?: string;            // Resume a previous session
});

// session object
interface Session {
  id: string;
  token: string;               // Ephemeral provider token
  provider: VoiceProvider;
  model: string;
  voice: string;
  expiresAt: number;
  connect(): Promise<VoiceSessionConnection>;          // Browser only
  connectServer(): Promise<VoiceServerConnection>;     // Node.js only
}

// List sessions
const sessions = await vr.sessions.list({
  endUserId?: string;
  status?: 'active' | 'completed' | 'extracting';
  limit?: number;
  cursor?: string;
});

// Get session details (transcript, extractions, usage)
const detail = await vr.sessions.get(sessionId);
```

### 4.3 Voice Session Connection (Browser)

```typescript
const connection = await session.connect({
  autoCapture?: boolean;        // true (default) — auto-start mic capture
  autoPlayback?: boolean;       // true (default) — auto-play assistant audio
  kickoffPrompt?: string;       // Prompt to trigger first model response
});

interface VoiceSessionConnection {
  // State
  readonly state: 'connecting' | 'ready' | 'disconnected' | 'error';
  readonly isMuted: boolean;

  // Audio control
  mute(): void;
  unmute(): void;
  toggleMute(): void;

  // Text input (typed message during voice session)
  sendText(text: string): void;

  // Tool call response
  respondToToolCall(callId: string, output: Record<string, unknown>): void;

  // Disconnect
  disconnect(): Promise<void>;

  // Events
  on(event: 'ready', handler: () => void): void;
  on(event: 'user_speech_started', handler: () => void): void;
  on(event: 'user_transcript', handler: (data: TranscriptEvent) => void): void;
  on(event: 'assistant_transcript', handler: (data: TranscriptEvent) => void): void;
  on(event: 'assistant_audio', handler: (data: AudioEvent) => void): void;
  on(event: 'tool_call', handler: (data: ToolCallEvent) => void): void;
  on(event: 'turn_complete', handler: () => void): void;
  on(event: 'interrupted', handler: () => void): void;
  on(event: 'error', handler: (data: ErrorEvent) => void): void;
  on(event: 'disconnected', handler: (data: DisconnectedEvent) => void): void;
  off(event: string, handler: Function): void;
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

interface DisconnectedEvent {
  reason: string;
  intentional: boolean;
}
```

### 4.4 Voice Experience Controls

```typescript
// Use a preset
experienceControls: 'reflective_coaching'
experienceControls: 'balanced_assistant'
experienceControls: 'fast_support'
experienceControls: 'phone_triage'

// Or use a custom object
experienceControls: {
  pauseTolerance: 'high',
  interruptionSensitivity: 'low',
  falseInputGuard: 'very_high',
  turnCommitPolicy: 'server_only',
  responseTempo: 'reflective',
}

// Or use custom with provider-specific overrides
experienceControls: {
  pauseTolerance: 'medium',
  interruptionSensitivity: 'medium',
  falseInputGuard: 'medium',
  turnCommitPolicy: 'hybrid_fallback',
  responseTempo: 'balanced',
  providerOverrides: {
    openai: {
      turn_detection: { silence_duration_ms: 1200 },
    },
  },
}
```

### 4.5 Tool Declarations

```typescript
interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;             // For arrays
  properties?: Record<string, ToolParameterSchema>;  // For objects
  required?: string[];                     // For objects
}
```

The SDK translates this unified format to provider-specific schemas internally (e.g. uppercase types for Gemini). Developers never write provider-specific tool schemas.

### 4.6 Outbound Calls

```typescript
const call = await vr.calls.create({
  to: string;                  // E.164 phone number
  from: string;                // Provisioned VoiceRails number (E.164)
  workflowId?: string;         // Workflow to run on the call
  systemPrompt?: string;       // Inline prompt (if no workflow)
  provider?: VoiceProvider;    // Voice provider for the call
  voice?: string;              // Voice name
  tools?: ToolDeclaration[];   // Inline tools
  experienceControls?: string | ExperienceControls;
  metadata?: Record<string, string>;
  endUserId?: string;
  scheduledAt?: string;        // ISO-8601 timestamp for scheduled call
  webhookUrl?: string;         // Override default webhook for this call
});

interface Call {
  id: string;
  sessionId: string;
  status: 'queued' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer';
  to: string;
  from: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

// Get call status
const call = await vr.calls.get(callId);

// List calls
const calls = await vr.calls.list({ status?, limit?, cursor? });
```

### 4.7 Telephony Number Management

```typescript
// Search available numbers
const available = await vr.telephony.numbers.search({
  country: string;               // ISO 3166-1 alpha-2
  type?: 'local' | 'mobile' | 'toll_free';
  areaCode?: string;
  features?: ('voice_inbound' | 'voice_outbound' | 'sms')[];
  limit?: number;
});

// Provision a number
const number = await vr.telephony.numbers.provision({
  country: string;
  type: 'local' | 'mobile' | 'toll_free';
  areaCode?: string;
  specificNumber?: string;       // E.164 from search results
});

// Assign to workflow
await vr.telephony.numbers.assign(numberId, {
  workflowId: string;
  environment: string;
});

// Release
await vr.telephony.numbers.release(numberId);

// List provisioned numbers
const numbers = await vr.telephony.numbers.list();
```

### 4.8 Workflows

```typescript
// Create a workflow
const workflow = await vr.workflows.create({
  name: string;
  definition: WorkflowDefinition;    // See Section 6
});

// Update
await vr.workflows.update(workflowId, { definition });

// List
const workflows = await vr.workflows.list();

// Get
const workflow = await vr.workflows.get(workflowId);

// Deploy to environment
await vr.workflows.deploy(workflowId, {
  environment: 'production' | 'staging';
  version?: string;
});
```

### 4.9 Analytics

```typescript
// Usage summary
const usage = await vr.analytics.usage({
  from: string;        // ISO-8601
  to: string;
  groupBy?: 'day' | 'week' | 'month';
});

// Returns
interface UsageSummary {
  totalSessions: number;
  totalMinutes: number;
  totalCalls: number;
  totalCost: { platformUsd: number; providerUsd: number; telephonyUsd: number };
  byProvider: Record<string, { sessions: number; minutes: number; costUsd: number }>;
  byDay?: UsageDayBreakdown[];
}

// Provider performance
const perf = await vr.analytics.providerPerformance({
  from: string;
  to: string;
  provider?: VoiceProvider;
});

// Returns latency percentiles, error rates, call success rates
```

---

## 5. Webhook Contract

### 5.1 Registration

```typescript
await vr.webhooks.create({
  url: string;
  events: WebhookEventType[];
  secret?: string;          // If not provided, VoiceRails generates one
  environment?: string;
});
```

### 5.2 Webhook Events

| Event | When | Payload |
|-------|------|---------|
| `session.started` | Session created and connected | `{ sessionId, provider, channel, endUserId, metadata }` |
| `session.completed` | Session ended normally | `{ sessionId, durationSeconds, messageCount, transcript }` |
| `session.failed` | Session ended with error | `{ sessionId, error }` |
| `session.tool_call` | Model invoked a tool | `{ sessionId, callId, name, args }` |
| `session.extraction_complete` | Post-session extraction finished | `{ sessionId, extractions }` |
| `call.initiated` | Outbound call started ringing | `{ callId, sessionId, to, from }` |
| `call.connected` | Call was answered | `{ callId, sessionId }` |
| `call.completed` | Call ended | `{ callId, sessionId, durationSeconds, transcript }` |
| `call.failed` | Call failed or was not answered | `{ callId, error }` |
| `number.provisioned` | Phone number provisioned | `{ numberId, e164, country }` |
| `number.released` | Phone number released | `{ numberId, e164 }` |

### 5.3 Webhook Payload Format

```json
{
  "id": "evt_abc123",
  "type": "session.completed",
  "createdAt": "2026-03-01T14:30:00Z",
  "appId": "app_xyz",
  "environment": "production",
  "data": {
    "sessionId": "ses_...",
    "durationSeconds": 245,
    "messageCount": 12,
    "transcript": [
      { "role": "assistant", "text": "Hello! How can I help?", "timestamp": "..." },
      { "role": "user", "text": "I'd like to schedule an appointment.", "timestamp": "..." }
    ]
  }
}
```

### 5.4 Webhook Signature Verification

Every webhook request includes:
- `X-VoiceRails-Signature`: HMAC-SHA256 of the raw body using the webhook secret
- `X-VoiceRails-Timestamp`: Unix timestamp of the event

```typescript
import { verifyWebhookSignature } from '@voicerails/node';

app.post('/webhooks/voicerails', (req, res) => {
  const isValid = verifyWebhookSignature({
    payload: req.rawBody,
    signature: req.headers['x-voicerails-signature'],
    timestamp: req.headers['x-voicerails-timestamp'],
    secret: process.env.VOICERAILS_WEBHOOK_SECRET,
    toleranceSeconds: 300,  // reject events older than 5 minutes
  });

  if (!isValid) return res.status(401).send('Invalid signature');

  const event = JSON.parse(req.rawBody);
  // handle event...
  res.status(200).send('ok');
});
```

### 5.5 Server-Side Tool Call Handling (Alternative to Client-Side)

For secure or complex tool calls, developers can handle them server-side instead of in the browser:

1. Register tools with `webhookUrl` override per tool:

```typescript
const session = await vr.sessions.create({
  tools: [
    {
      name: 'book_appointment',
      description: 'Book an appointment in the calendar system.',
      parameters: { ... },
      webhookUrl: 'https://api.example.com/voicerails/tools',  // server-side handler
    },
  ],
});
```

2. VoiceRails calls the webhook when the model invokes the tool:

```json
POST https://api.example.com/voicerails/tools
{
  "type": "tool_call",
  "sessionId": "ses_...",
  "callId": "call_abc",
  "name": "book_appointment",
  "args": { "date": "2026-03-15", "time": "14:00" }
}
```

3. Developer responds synchronously:

```json
{
  "output": { "result": "Appointment booked for March 15 at 2:00 PM." }
}
```

VoiceRails routes the response back to the model. Timeout: 10 seconds. If the webhook fails or times out, VoiceRails sends a fallback response to the model indicating the tool call could not be completed.

---

## 6. Workflow Definition Format

### 6.1 Design Principles

- Workflows are JSON documents that define conversation behaviour
- The same format is used by the SDK (code-authored) and the visual designer (drag-and-drop)
- Workflows are portable — export from visual designer, extend in code
- Workflows are versioned and deployable per environment

### 6.2 Workflow Schema

```typescript
interface WorkflowDefinition {
  version: '1.0';
  name: string;
  description?: string;

  config: {
    provider?: VoiceProvider;
    voice?: string;
    experienceControls?: string | ExperienceControls;
    channel?: 'in_app' | 'telephony' | 'both';
    maxDurationSeconds?: number;
  };

  stages: WorkflowStage[];

  tools?: ToolDeclaration[];

  onComplete?: {
    webhookUrl?: string;
    extractionSchema?: ExtractionSchema;
  };
}

type WorkflowStage =
  | GreetingStage
  | ConversationStage
  | ExtractionStage
  | ConditionStage
  | ActionStage
  | HandoffStage
  | EndStage;
```

### 6.3 Stage Types

**Greeting Stage** — The opening of the conversation.

```json
{
  "id": "greet",
  "type": "greeting",
  "prompt": "Welcome the caller warmly and ask how you can help today.",
  "next": "main_conversation"
}
```

**Conversation Stage** — An open conversation segment with a system prompt.

```json
{
  "id": "main_conversation",
  "type": "conversation",
  "systemPrompt": "You are a patient intake assistant. Gather the patient's symptoms, duration, and severity.",
  "tools": ["capture_symptoms"],
  "maxTurns": 20,
  "next": "check_urgency"
}
```

**Extraction Stage** — Structured data gathering through natural conversation (the intelligent extraction engine).

```json
{
  "id": "gather_info",
  "type": "extraction",
  "prompt": "Have a natural conversation to understand the user's health goals and barriers.",
  "schema": {
    "outcomes": [
      {
        "field": "primary_goal",
        "type": "string",
        "description": "The user's main health objective",
        "required": true
      },
      {
        "field": "barriers",
        "type": "array",
        "description": "What's preventing progress",
        "required": false,
        "maxItems": 5
      },
      {
        "field": "motivation",
        "type": "enum",
        "options": ["low", "moderate", "high"],
        "required": true
      }
    ],
    "completionThreshold": 0.8
  },
  "maxTurns": 15,
  "next": "summarise"
}
```

**Condition Stage** — Branch based on extracted data or conversation state.

```json
{
  "id": "check_urgency",
  "type": "condition",
  "expression": "extractions.severity === 'high' || extractions.duration_days > 7",
  "ifTrue": "escalate",
  "ifFalse": "schedule_routine"
}
```

**Action Stage** — Call an external API or webhook.

```json
{
  "id": "schedule_routine",
  "type": "action",
  "webhookUrl": "https://api.example.com/appointments",
  "method": "POST",
  "payload": {
    "patientId": "{{ endUserId }}",
    "symptoms": "{{ extractions.symptoms }}",
    "preferredDate": "{{ extractions.preferred_date }}"
  },
  "onSuccess": "confirm_booking",
  "onFailure": "booking_error"
}
```

**Handoff Stage** — Transfer to a human or another system.

```json
{
  "id": "escalate",
  "type": "handoff",
  "prompt": "Let the caller know you're transferring them to a nurse.",
  "transferTo": "+14155559999",
  "contextPayload": {
    "symptoms": "{{ extractions.symptoms }}",
    "severity": "{{ extractions.severity }}"
  }
}
```

**End Stage** — Conclude the conversation.

```json
{
  "id": "confirm_booking",
  "type": "end",
  "prompt": "Confirm the appointment details, wish them well, and say goodbye.",
  "summaryGeneration": true
}
```

### 6.4 Complete Workflow Example

```json
{
  "version": "1.0",
  "name": "Patient Intake",
  "description": "Gather patient symptoms and schedule or escalate.",
  "config": {
    "provider": "openai",
    "voice": "alloy",
    "experienceControls": "balanced_assistant",
    "channel": "both",
    "maxDurationSeconds": 600
  },
  "stages": [
    {
      "id": "greet",
      "type": "greeting",
      "prompt": "Welcome the caller to the clinic and ask what brings them in today.",
      "next": "gather_symptoms"
    },
    {
      "id": "gather_symptoms",
      "type": "extraction",
      "prompt": "Have a caring conversation to understand their symptoms.",
      "schema": {
        "outcomes": [
          { "field": "symptoms", "type": "array", "description": "List of symptoms", "required": true },
          { "field": "duration_days", "type": "number", "description": "How long symptoms have lasted", "required": true },
          { "field": "severity", "type": "enum", "options": ["mild", "moderate", "high"], "required": true },
          { "field": "preferred_date", "type": "string", "description": "When they'd like to come in", "required": false }
        ],
        "completionThreshold": 0.8
      },
      "maxTurns": 15,
      "next": "check_urgency"
    },
    {
      "id": "check_urgency",
      "type": "condition",
      "expression": "extractions.severity === 'high'",
      "ifTrue": "escalate",
      "ifFalse": "schedule"
    },
    {
      "id": "schedule",
      "type": "action",
      "webhookUrl": "https://api.clinic.com/appointments",
      "method": "POST",
      "payload": {
        "symptoms": "{{ extractions.symptoms }}",
        "date": "{{ extractions.preferred_date }}"
      },
      "onSuccess": "confirm",
      "onFailure": "schedule_error"
    },
    {
      "id": "escalate",
      "type": "handoff",
      "prompt": "Let them know a nurse will speak with them shortly.",
      "transferTo": "+14155559999"
    },
    {
      "id": "confirm",
      "type": "end",
      "prompt": "Confirm the appointment and wish them well.",
      "summaryGeneration": true
    },
    {
      "id": "schedule_error",
      "type": "end",
      "prompt": "Apologise that scheduling isn't available right now and suggest calling back.",
      "summaryGeneration": false
    }
  ],
  "tools": [
    {
      "name": "check_availability",
      "description": "Check available appointment slots.",
      "parameters": {
        "type": "object",
        "properties": {
          "date": { "type": "string", "description": "Requested date (YYYY-MM-DD)" }
        },
        "required": ["date"]
      }
    }
  ],
  "onComplete": {
    "webhookUrl": "https://api.clinic.com/voicerails/session-complete"
  }
}
```

---

## 7. React Integration (`@voicerails/react`)

### 7.1 Hooks

```typescript
import { useVoiceSession } from '@voicerails/react';

function VoicePanel() {
  const {
    status,           // 'idle' | 'connecting' | 'ready' | 'error'
    transcript,       // TranscriptEntry[]
    isMuted,
    isAssistantSpeaking,
    error,
    connect,
    disconnect,
    sendText,
    toggleMute,
  } = useVoiceSession({
    apiKey: 'vr_live_...',
    provider: 'openai',
    voice: 'alloy',
    systemPrompt: '...',
    tools: [...],
    experienceControls: 'balanced_assistant',
    onToolCall: async (callId, name, args) => {
      // handle tool call, return result
      return { result: 'done' };
    },
    onSessionComplete: (session) => {
      // session ended, transcript available
    },
  });

  return (
    <div>
      {transcript.map(entry => (
        <ChatBubble key={entry.streamKey} role={entry.role} text={entry.text} streaming={entry.isStreaming} />
      ))}
      <button onClick={() => status === 'idle' ? connect() : disconnect()}>
        {status === 'idle' ? 'Start' : 'End'}
      </button>
      <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
    </div>
  );
}
```

### 7.2 Components

```typescript
import { VoiceOrb, TranscriptView, VoiceControls } from '@voicerails/react';

// Animated orb that pulses with audio level
<VoiceOrb status={status} isAssistantSpeaking={isAssistantSpeaking} />

// Pre-built transcript display with streaming support
<TranscriptView transcript={transcript} />

// Mute, end, volume controls
<VoiceControls
  isMuted={isMuted}
  onToggleMute={toggleMute}
  onEnd={disconnect}
/>
```

---

## 8. Python SDK

### 8.1 Installation

```bash
pip install voicerails
```

### 8.2 Server-Side Usage

```python
from voicerails import VoiceRails

vr = VoiceRails(api_key="vr_live_...")

# Create a session (for use with your own frontend or telephony)
session = vr.sessions.create(
    provider="openai",
    voice="alloy",
    system_prompt="You are a friendly assistant.",
    tools=[...],
    experience_controls="balanced_assistant",
)

# Trigger outbound call
call = vr.calls.create(
    to="+14155551234",
    from_number="+14155550000",
    workflow_id="intake-flow",
)

# Get session results
detail = vr.sessions.get(session.id)
print(detail.transcript)
print(detail.extractions)

# Provision number
number = vr.telephony.numbers.provision(country="US", type="local")

# Analytics
usage = vr.analytics.usage(from_date="2026-03-01", to_date="2026-03-31")
```

### 8.3 Webhook Handler (Flask)

```python
from voicerails.webhooks import verify_signature

@app.route("/webhooks/voicerails", methods=["POST"])
def handle_webhook():
    if not verify_signature(
        payload=request.data,
        signature=request.headers.get("X-VoiceRails-Signature"),
        timestamp=request.headers.get("X-VoiceRails-Timestamp"),
        secret=os.environ["VOICERAILS_WEBHOOK_SECRET"],
    ):
        return "Unauthorized", 401

    event = request.get_json()
    if event["type"] == "session.completed":
        process_transcript(event["data"]["transcript"])

    return "ok", 200
```

### 8.4 Async Support

```python
from voicerails import AsyncVoiceRails

vr = AsyncVoiceRails(api_key="vr_live_...")

session = await vr.sessions.create(...)
call = await vr.calls.create(...)
```

---

## 9. CLI Specification

### 9.1 Commands

```bash
# Authentication
voicerails login                    # Browser-based OAuth login
voicerails logout

# Project management
voicerails init                     # Interactive setup: create app, select provider, region
voicerails apps list                # List apps
voicerails apps create <name>       # Create app

# Provider configuration
voicerails providers add openai     # Add provider, prompts for API key
voicerails providers list           # List configured providers
voicerails providers test openai    # Test provider connection

# Workflows
voicerails workflows list
voicerails workflows create <file>  # Create from JSON file
voicerails workflows deploy <id> --env production
voicerails workflows test <id>      # Run test session locally

# Telephony
voicerails numbers search --country US --type local
voicerails numbers provision --country US --area-code 415
voicerails numbers list
voicerails numbers assign <numberId> --workflow <workflowId>
voicerails numbers release <numberId>

# Testing
voicerails test call <workflowId>   # Trigger a test call to your verified number
voicerails test session <workflowId> # Start a test session in terminal

# Analytics
voicerails usage                    # Current period usage summary
voicerails usage --from 2026-03-01 --to 2026-03-31

# Diagnostics
voicerails logs --session <sessionId>    # Session logs
voicerails status                        # Platform health
```

### 9.2 Configuration File

`voicerails.json` in project root:

```json
{
  "appId": "app_abc123",
  "environment": "development",
  "region": "europe-west2",
  "defaultProvider": "openai",
  "defaultVoice": "alloy",
  "defaultExperienceControls": "balanced_assistant"
}
```

---

## 10. REST API Quick Reference

All SDK methods map to REST endpoints. Developers can use the REST API directly if they prefer.

### 10.1 Authentication

All requests include:
```
Authorization: Bearer vr_live_...
```

### 10.2 Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/sessions` | Create session, get ephemeral token |
| `GET` | `/v1/sessions` | List sessions |
| `GET` | `/v1/sessions/{id}` | Get session detail |
| `POST` | `/v1/sessions/{id}/finalize` | Finalize session |
| `POST` | `/v1/calls` | Create outbound call |
| `GET` | `/v1/calls/{id}` | Get call status |
| `GET` | `/v1/calls` | List calls |
| `POST` | `/v1/workflows` | Create workflow |
| `GET` | `/v1/workflows` | List workflows |
| `GET` | `/v1/workflows/{id}` | Get workflow |
| `PUT` | `/v1/workflows/{id}` | Update workflow |
| `POST` | `/v1/workflows/{id}/deploy` | Deploy to environment |
| `POST` | `/v1/telephony/numbers/search` | Search available numbers |
| `POST` | `/v1/telephony/numbers/provision` | Provision a number |
| `POST` | `/v1/telephony/numbers/{id}/assign` | Assign number to workflow |
| `POST` | `/v1/telephony/numbers/{id}/release` | Release number |
| `GET` | `/v1/telephony/numbers` | List provisioned numbers |
| `GET` | `/v1/analytics/usage` | Usage summary |
| `GET` | `/v1/analytics/providers` | Provider performance |
| `POST` | `/v1/webhooks` | Register webhook |
| `GET` | `/v1/webhooks` | List webhooks |
| `DELETE` | `/v1/webhooks/{id}` | Remove webhook |

### 10.3 Error Format

```json
{
  "error": {
    "code": "invalid_provider",
    "message": "Provider 'gemini' is not configured for this app. Add it in the dashboard or via CLI.",
    "status": 400,
    "details": {}
  }
}
```

Standard error codes: `unauthenticated`, `forbidden`, `not_found`, `invalid_argument`, `rate_limited`, `internal`, `provider_error`, `quota_exceeded`.

---

## 11. Project Structure (VoiceRails Codebase)

### 11.1 Monorepo Layout

```
voicerails/
├── packages/
│   ├── connection-layer/        # Provider adapters, event normalization, VAD translation
│   │   ├── src/
│   │   │   ├── adapters/        # openai.ts, gemini.ts, grok.ts, elevenlabs.ts
│   │   │   ├── audio/           # Capture, playback, format conversion
│   │   │   ├── echo/            # Echo guard framework
│   │   │   ├── controls/        # Experience controls translation
│   │   │   ├── types.ts         # NormalizedVoiceEvent, VoiceConnection interface
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── sdk/                     # @voicerails/sdk — public TypeScript/JavaScript SDK
│   │   ├── src/
│   │   │   ├── client.ts        # VoiceRails client
│   │   │   ├── sessions.ts      # Session API
│   │   │   ├── calls.ts         # Outbound calls API
│   │   │   ├── telephony.ts     # Number management API
│   │   │   ├── workflows.ts     # Workflow CRUD API
│   │   │   ├── analytics.ts     # Usage and performance API
│   │   │   ├── webhooks.ts      # Webhook registration API
│   │   │   ├── connection.ts    # VoiceSessionConnection (wraps connection-layer)
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── react/                   # @voicerails/react — React hooks + components
│   │   ├── src/
│   │   │   ├── useVoiceSession.ts
│   │   │   ├── components/      # VoiceOrb, TranscriptView, VoiceControls
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── node/                    # @voicerails/node — Server-side utilities
│   │   ├── src/
│   │   │   ├── webhooks.ts      # Signature verification
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── python-sdk/              # voicerails (Python)
│   │   ├── voicerails/
│   │   │   ├── client.py
│   │   │   ├── sessions.py
│   │   │   ├── calls.py
│   │   │   ├── telephony.py
│   │   │   ├── webhooks.py
│   │   │   └── types.py
│   │   └── pyproject.toml
│   │
│   └── cli/                     # voicerails CLI
│       ├── src/
│       │   ├── commands/
│       │   └── index.ts
│       └── package.json
│
├── platform/
│   ├── control-plane/           # Firebase Functions v2 — API handlers
│   │   ├── src/
│   │   │   ├── handlers/        # sessions, calls, workflows, telephony, analytics, webhooks
│   │   │   ├── services/        # Provider init, number lifecycle, billing
│   │   │   ├── middleware/       # Auth, rate limiting, tenant resolution
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── telephony-bridge/        # Cloud Run WebSocket bridge
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── bridgeApi.ts
│   │   │   └── config.ts
│   │   └── package.json
│   │
│   ├── workflow-engine/         # Workflow runtime interpreter
│   │   ├── src/
│   │   │   ├── interpreter.ts
│   │   │   ├── stages/          # Stage handlers
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── dashboard/               # Developer console (React)
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── services/
│       └── package.json
│
├── infrastructure/
│   ├── terraform/               # IaC for platform deployment
│   │   ├── modules/
│   │   └── stacks/
│   └── ci/                      # GitHub Actions / Cloud Build
│
├── docs/                        # Public documentation site
│   ├── quickstart.md
│   ├── sdk-reference/
│   ├── api-reference/
│   ├── guides/
│   └── examples/
│
├── examples/                    # Reference integrations
│   ├── nextjs-intake/           # Next.js patient intake example
│   ├── flask-outbound/          # Python Flask outbound calling
│   └── flank-coaching/          # Flank reference implementation
│
└── package.json                 # Workspace root
```

### 11.2 Package Dependency Graph

```
@voicerails/react  →  @voicerails/sdk  →  @voicerails/connection-layer
@voicerails/node   →  (standalone, no SDK dependency)
voicerails (Python) →  (standalone, calls REST API)
cli                →  @voicerails/sdk
```

The connection layer has zero external dependencies beyond WebSocket. It runs in both browser and Node.js.

---

## 12. Extraction Engine — Developer Interface

### 12.1 Defining Extraction Schemas

Developers define what data to extract, not how to extract it. The platform handles the conversational approach.

```typescript
interface ExtractionSchema {
  outcomes: ExtractionOutcome[];
  completionThreshold?: number;       // 0.0-1.0, default 0.8
  conversationStyle?: string;         // Guidance for the model's approach
}

interface ExtractionOutcome {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
  description: string;
  required?: boolean;
  options?: string[];                  // For enum type
  maxItems?: number;                   // For array type
  validation?: string;                 // Natural language validation rule
}
```

### 12.2 Real-Time Extraction Progress

During a session, the SDK emits extraction progress events:

```typescript
connection.on('extraction_progress', (data) => {
  // data.completionScore: 0.65
  // data.fields: {
  //   primary_goal: { status: 'captured', value: 'Run a marathon', confidence: 0.92 },
  //   barriers: { status: 'partial', value: ['Time constraints'], confidence: 0.7 },
  //   motivation: { status: 'pending' },
  // }
});
```

### 12.3 Post-Session Extraction Results

```typescript
const session = await vr.sessions.get(sessionId);

session.extractions;
// {
//   completionScore: 0.85,
//   fields: {
//     primary_goal: { value: 'Run a marathon by October', confidence: 0.95 },
//     barriers: { value: ['Time constraints', 'Knee injury'], confidence: 0.88 },
//     motivation: { value: 'high', confidence: 0.82 },
//   }
// }
```

---

## 13. Memory Engine — Developer Interface

### 13.1 Memory Scopes

| Scope | Persists | Use Case |
|-------|---------|----------|
| `session` | Duration of one session | Track what's been discussed in this conversation |
| `user` | Across all sessions for one end user | Remember user preferences, history, context |
| `app` | Across all users | Shared knowledge base, product info |

### 13.2 SDK Usage

```typescript
// Write to user memory
await vr.memory.set({
  endUserId: 'user_123',
  scope: 'user',
  key: 'preferred_appointment_time',
  value: 'mornings',
});

// Read from user memory
const pref = await vr.memory.get({
  endUserId: 'user_123',
  scope: 'user',
  key: 'preferred_appointment_time',
});

// Automatic memory: session summaries are auto-persisted as user memory
// and available to subsequent sessions via the system prompt context
```

### 13.3 Memory in Workflows

Workflows can read and write memory at any stage:

```json
{
  "id": "load_context",
  "type": "memory_read",
  "scope": "user",
  "keys": ["preferred_appointment_time", "last_visit_summary"],
  "injectIntoPrompt": true,
  "next": "main_conversation"
}
```

---

## 14. Document Relationships — Complete Map

```
┌────────────────────────────────┐
│  voice-infrastructure-prd-v2   │  Product: what, why, for whom, pricing
└───────────────┬────────────────┘
                │
    ┌───────────┼───────────────────┐
    │           │                   │
    ▼           ▼                   ▼
┌─────────┐ ┌───────────────┐ ┌──────────────────┐
│ tech    │ │ implementation│ │ THIS DOCUMENT    │
│ spec v2 │ │ guide         │ │                  │
│         │ │               │ │ SDK API, workflow│
│ Platform│ │ Connection    │ │ format, webhooks,│
│ eng:    │ │ layer, adapters│ │ CLI, project    │
│ tenancy,│ │ VAD, audio,   │ │ structure       │
│ data,   │ │ echo, tools   │ │                  │
│ security│ │               │ └──────────────────┘
│ billing │ └───────┬───────┘
│ observ. │         │ source material
│ infra   │         ▼
└─────────┘ ┌───────────────┐
            │ implementation│  Raw Flank learnings
            │ learnings     │  (appendix)
            └───────────────┘
```

---

*End of document.*
