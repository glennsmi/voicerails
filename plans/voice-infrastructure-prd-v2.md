# Voice Infrastructure Platform — Product Requirements Document

**Version:** 2.0  
**Date:** March 2026  
**Author:** Fueld AI Ltd  
**Status:** Draft — Internal Review

---

## 0. Naming Candidates

The platform needs a name that signals speed, voice, developer tooling, and production readiness. It should appeal to engineering teams building voice-first AI products and non-technical builders creating voice experiences.

| Name | Rationale | Domain-Friendly |
|------|-----------|-----------------|
| **Vocable** | "Capable of being voiced" — technical, clean, memorable | vocable.dev |
| **Larynx** | The voice organ — anatomical, distinctive, nerdy in a good way | larynx.dev / larynx.io |
| **Callstack** | Developer-native term, repurposed for voice call infrastructure | callstack.ai |
| **Voxline** | Vox (voice) + line (telephony/pipeline) — clear and direct | voxline.dev |
| **SayStack** | Friendly, approachable, immediately communicates voice + infra | saystack.dev |
| **Resonance** | Premium feel, implies depth and continuity (memory engine) | resonance.ai |
| **Cadence** | Rhythm of speech, implies flow and orchestration | cadence.voice |
| **Utterance** | Core NLP term, signals technical depth to AI builders | utterance.dev |
| **VoiceRail** | Infrastructure metaphor — rails for voice apps | voicerail.dev |
| **Talkpipe** | Pipeline imagery, casual but clear | talkpipe.dev |

**Recommendation:** **Vocable** or **VoiceRail** — both immediately communicate what the platform does, feel developer-native, and have strong domain potential. Vocable leans premium; VoiceRail leans infrastructure-obvious.

---

## 1. Executive Summary

VoiceRails is a standalone developer infrastructure platform for building, deploying, and operating production-grade voice AI applications. It serves two distinct user types: **developers** who integrate via SDKs, and **non-technical builders** who create voice experiences through a visual flow designer.

The platform combines five core capabilities that teams typically struggle to integrate reliably:

1. **Real-time voice model orchestration** across multiple providers with tool calling support
2. **Telephony infrastructure** for production inbound and outbound phone calls
3. **Configurable conversation workflows** with developer-defined processing logic and a visual designer for non-technical users
4. **Intelligent extraction engine** that gathers structured data from natural conversation — beyond simple form-filling
5. **Structured conversation memory and post-call analysis engine**

The commercial model is:
- Base platform fee (by plan)
- Seat-based team fee when multi-user collaboration is enabled
- Included usage minutes with overage pricing
- Transparent provider + telephony pass-through at cost + markup

The product moat is **fast setup + high reliability + extensibility + dual access paths**: developers can launch quickly via SDK, non-technical builders can ship via visual designer, and both can add custom workflows/tools without deep infra work and keep scaling without migrating away.

**Core promise:** Go from zero to a live production voice agent — in-app or over the phone — in under 30 minutes.

---

## 2. Positioning

> VoiceRails is the fastest way for product teams and non-technical builders to ship production-grade voice agents across app and phone — one platform combining real-time model orchestration, telephony routing, intelligent data extraction, conversation workflows, and structured memory.

**What this is:**
- A developer infrastructure platform (like Twilio for voice AI orchestration) with SDK access
- A visual flow designer for non-technical builders to create and host voice experiences without code
- Provider-agnostic with clean model encapsulation and hot-swap capability
- Opinionated enough to be fast, flexible enough to be production-grade
- A managed multi-tenant platform with an upgrade path to dedicated enterprise infrastructure

**What this is not:**
- Not a vertical application (coaching, sales, support) — those are built *on* this
- Not a closed black-box voice bot with no developer control
- Not an outcome-based consulting service

---

## 3. Problem Statement

### 3.1 Developer Pain

Teams building voice AI products repeatedly hit the same walls:

**Fragmented provider landscape.** OpenAI Realtime, Google Gemini Live, ElevenLabs, Deepgram, Cartesia — each has a different session model, audio format, event schema, and tool-calling interface. When providers ship breaking changes or new capabilities, teams scramble.

**Micro-configuration hell.** Getting a voice service running smoothly requires extensive micro-configuration across audio formats, VAD sensitivity, interruption handling, session management, and provider-specific quirks. Each provider has its own set of levers to tune.

**App voice and phone voice are separate engineering efforts.** In-app WebRTC sessions and Twilio media streams require different bridging logic, different deployment topologies, and different failure modes. Most teams build one well and bodge the other.

**Post-call processing is an afterthought.** Transcripts land in a bucket. Extraction of structured data, memory persistence, and downstream triggers are hand-rolled per project with no reusable pipeline.

**Infrastructure setup is slow and error-prone.** Cloud Run services, Secret Manager bindings, IAM roles, webhook configuration, scheduler setup — teams spend weeks on plumbing before writing any conversation logic.

**Operationalisation is hard.** Latency tracking, cost attribution, retry logic, call diagnostics, and provider failover are all production requirements that most teams defer until they bite.

### 3.2 Non-Technical Builder Pain

**Voice is inaccessible without engineering.** Consultants, coaches, business owners, and domain experts who understand their use cases cannot build voice experiences without hiring developers or learning complex APIs.

**Traditional voice builders are primitive.** Existing IVR and chatbot builders handle linear flows and simple form-filling ("What is your name? What is your date of birth?") but cannot handle the conversational, non-deterministic data gathering that modern AI voice makes possible.

**No hosting path.** Even when a non-technical user can design a flow, there is no simple way to host and operate it without managing cloud infrastructure.

### 3.3 Market Context

The market is moving toward faster "voice feature shipping" with lower operational burden. Every AI-forward product team is evaluating voice. Very few have the infrastructure engineering depth to make it production-reliable. The gap between "cool demo" and "production voice agent handling 10,000 calls/month" is where VoiceRails sits.

Simultaneously, voice is becoming a major platform modality. The ability to let non-technical users access voice AI quickly and easily — to build conversational experiences that extract complex, nuanced information from natural dialogue — represents a large and underserved market beyond traditional developer tooling.

---

## 4. User Personas

### 4.1 Technical Developer

**Who:** Software engineers and product engineers at startups and mid-size companies building voice-first or voice-enabled products.

**Context:** They have tested one or more voice APIs (OpenAI Realtime, Gemini Live) and understand the space. They need production infrastructure, not another demo. They want to write their own conversation logic, connect to their own backends, and control the experience end-to-end.

**Jobs to be done:**
- Integrate voice capabilities into an existing application via SDK
- Swap and A/B test voice providers without rewriting application code
- Deploy both in-app and telephony voice from a single codebase
- Track usage, costs, and performance in real time
- Connect post-call data to their own CRM, database, or analytics pipeline

**Access path:** JavaScript and Python SDKs, REST APIs, CLI tooling, developer console.

### 4.2 Non-Technical Builder

**Who:** Coaches, consultants, business owners, domain experts, and agency staff who have deep subject-matter expertise but limited or no coding ability.

**Context:** They understand what information they need to gather from conversations and what outcomes they want, but cannot build the technical infrastructure to make it happen. They are comfortable with visual drag-and-drop tools (similar to Zapier, Make, or Typeform) but not with writing code.

**Jobs to be done:**
- Design voice conversation flows visually without writing code
- Define what complex information or insights to extract from natural conversation
- Host and operate a voice experience on the platform without managing infrastructure
- Monitor usage, review extracted data, and iterate on their flows

**Access path:** Visual flow designer in the web dashboard, hosted app runtime.

### 4.3 Small Team / Agency

**Who:** Small teams (2–10 people) or agencies building voice experiences for clients across multiple domains.

**Context:** They need collaboration features, multiple projects, and the ability to mix SDK-based and visual-designer-based approaches. They may have one developer and several non-technical domain specialists.

**Jobs to be done:**
- Manage multiple voice projects for different clients or use cases
- Collaborate across technical and non-technical team members
- Track usage and costs across projects with clear attribution
- Scale from prototype to production without re-platforming

**Access path:** Team dashboard, shared projects, SDK + visual designer depending on team member role.

---

## 5. Product Architecture

### 5.1 Core Modules

#### Module 1: Real-time Voice Model Orchestration

- Unified session API abstracting multiple real-time voice providers (OpenAI Realtime API, Gemini Live, ElevenLabs, etc.)
- Provider routing with configurable fallback chains
- Standardised session lifecycle: `create → configure → stream → finalise`
- Native tool-calling support with a unified schema that maps to each provider's format
- Hot-swappable provider selection — change model mid-deployment without code changes
- Provider A/B testing: easily test different voice services against a specific use case to find the best fit, with comparative analytics
- Automatic failover: if one voice service goes down, seamlessly fall over to a configured secondary provider
- Provider extension layer for custom voice features (for example: ElevenLabs voice profiles/voice IDs) without breaking core workflow contracts
- Audio format normalisation across providers

#### Module 2: Telephony Infrastructure

- Twilio media stream bridge deployed as a Cloud Run container
- Unified experience: developers and builders get the same voice AI experience whether in-app or telephony, without rebuilding
- Inbound call handling with configurable routing rules
- Outbound call initiation via API or scheduled triggers
- Real-time audio bridge connecting telephony streams to the selected voice provider
- Full telephony number lifecycle via API/UI: search, reserve, provision, assign, and release
- Country/jurisdiction-aware number selection with staged allowlist and compliance gating
- DTMF handling and call transfer support
- Call recording and compliance controls

#### Module 3: Conversation Workflow Engine

- Developer-defined conversation workflows with configurable stages:
  - Session initialisation (context loading, persona selection)
  - Prompt orchestration and transition logic
  - Tool execution and side-effect handling
  - Session finalisation and handoff
- Trigger-based invocation: app event, API call, scheduled time, inbound phone call
- Workflow versioning and A/B deployment support
- JSON workflow definition format (n8n-style) for deterministic, portable configuration
- First-class tool/connector registration so teams can attach custom business logic rapidly
- Structured LLM composition blocks (prompt templates, tool schemas, guardrails, and response contracts) to make rapid workflow authoring reliable at scale
- Custom processing hooks at every stage — developers define their own logic, not ours

#### Module 4: Visual Flow Designer

A drag-and-drop canvas for non-technical builders to create voice conversation flows without writing code. Flows created in the visual designer compile down to the same JSON workflow format used by the SDK, ensuring full compatibility between both paths.

**Canvas and interaction model:**
- Drag-and-drop block placement on an infinite canvas
- Connect blocks via edges to define conversation flow and branching
- Real-time preview and simulation of conversation flows
- Version history with restore capability

**Block library:**

| Block Type | Purpose | Configuration |
|-----------|---------|---------------|
| **Start** | Entry point for the conversation | Trigger type (app event, phone call, scheduled), initial greeting, persona selection |
| **Extraction** | Intelligent data gathering (see Module 5) | Define what information/insights to extract, validation rules, conversation style |
| **Condition** | Branch the conversation based on extracted data or user input | If/else logic, pattern matching, threshold checks |
| **Action** | Call external APIs, write to databases, trigger webhooks | Endpoint configuration, payload mapping, error handling |
| **Memory** | Read from or write to the conversation memory graph | Memory scope (session, user, cross-session), key-value or structured |
| **Prompt** | Direct LLM prompt injection for custom conversation segments | System prompt, temperature, model selection |
| **Handoff** | Transfer to a human agent or another system | Transfer target, context passing, escalation rules |
| **End** | Terminate the conversation | Summary generation, post-call triggers, farewell message |

**Design principles:**
- Flows compile to the same JSON workflow format as SDK-authored workflows
- Any flow built visually can be exported and extended via SDK
- Any SDK workflow can be imported and visualised (read-only for complex custom logic)
- Blocks are extensible — developers can register custom block types via SDK

#### Module 5: Intelligent Extraction Engine

This is a core differentiator. Traditional voice platforms handle linear form-filling — "What is your name? What is your date of birth?" The intelligent extraction engine handles complex, non-deterministic information gathering through natural conversation.

**How it works:**

Builders (via visual designer) or developers (via SDK) define **extraction outcomes** — the information or insights they want to gather from a conversation. The LLM handles the conversational approach to drawing that information out naturally, making the conversation feel relaxed and human rather than like a form.

**Extraction outcome configuration:**

```json
{
  "extraction_id": "health_goals_assessment",
  "outcomes": [
    {
      "field": "primary_health_goal",
      "type": "string",
      "description": "The user's main health or fitness objective",
      "required": true,
      "validation": "Must be specific and actionable, not vague"
    },
    {
      "field": "barriers_to_progress",
      "type": "array<string>",
      "description": "Factors preventing the user from achieving their goal",
      "required": false,
      "max_items": 5
    },
    {
      "field": "motivation_level",
      "type": "enum",
      "options": ["low", "moderate", "high", "very_high"],
      "description": "Assessed motivation based on conversational cues",
      "required": true
    },
    {
      "field": "previous_attempts",
      "type": "object",
      "description": "What they've tried before and why it didn't work",
      "required": false
    }
  ],
  "conversation_style": "empathetic_coaching",
  "max_turns": 15,
  "completion_threshold": 0.8
}
```

**Example use cases:**

| Domain | What's being extracted | Why conversational extraction matters |
|--------|----------------------|--------------------------------------|
| **Health coaching** | Goals, barriers, motivation, lifestyle context | People reveal more about health barriers in natural conversation than in forms |
| **Financial advice** | Risk tolerance, financial goals, life circumstances | Financial attitudes are complex and emotionally loaded — conversation draws them out |
| **HR screening** | Cultural fit signals, role motivation, growth mindset indicators | Structured interviews miss nuance; conversational extraction captures it |
| **Customer research** | Product satisfaction drivers, unmet needs, switching triggers | Surveys get surface answers; conversation gets depth |
| **Education** | Learning style, knowledge gaps, confidence levels | Adaptive assessment through dialogue, not multiple-choice |

**Runtime behaviour:**
- The LLM receives the extraction schema as context alongside the conversation
- Extraction happens in real-time during the conversation — the system tracks which outcomes have been satisfied
- The conversation adapts: if key outcomes are still missing, the LLM steers naturally toward them
- A completion score tracks progress against the extraction schema
- Post-conversation, a structured extraction report is generated with confidence scores per field
- Developers receive extraction results via webhook or can query them via API

#### Module 6: Analysis + Structured Memory Engine

- Automated transcript finalisation pipeline
- Configurable extraction schemas: developers define what structured data to pull from each conversation
- Durable memory graph with per-user, per-session, and cross-session state
- Common patterns baked in as platform primitives: user context persistence, conversation continuity across sessions, topic-level memory
- Developer-facing webhook events for all post-call artifacts
- Integration hooks for downstream systems (CRM, analytics, custom backends, tenant-owned databases)

### 5.2 Platform Services Layer

Underpinning all modules:

- **Observability dashboard:** Latency percentiles, cost per call, provider performance, error rates
- **Cost attribution engine:** Real-time cost tracking per call, per workflow, per provider with forecasting
- **Retry and failover logic:** Automatic provider failover, configurable retry policies
- **Security baseline:** Secret management, IAM scoping, encryption at rest and in transit
- **Developer console:** API key management, webhook configuration, environment controls, logs
- **Sandbox / test environment:** Builders and developers can test flows and integrations without burning through production minutes
- **Connector runtime:** Secure outbound connectors to tenant systems (DBs, APIs, queues) without forcing any single database
- **Authentication:** Sign up with Google or GitHub accounts for frictionless developer onboarding

---

## 6. Technical Architecture

> **Implementation detail:** The connection layer architecture, provider adapter specifications, event normalisation schema, VAD translation tables, and audio pipeline configuration are defined in the companion **[Technical Implementation Guide](voice-platform-implementation-guide.md)**. The Voice Experience Controls translation layer is specified in the **[Voice Experience Controls Spec](voice-experience-controls-spec.md)**.

### 6.1 Stack

| Layer | Technology |
|-------|-----------|
| Control Plane | Firebase-first (Auth, Firestore, Functions v2) |
| Runtime | Google Cloud Run (telephony bridge containers) |
| Functions | Firebase Functions v2 (workflow orchestration, webhooks) |
| Secrets | Google Secret Manager |
| Messaging | Google Pub/Sub (async events, post-call pipeline) |
| Scheduling | Google Cloud Scheduler (outbound calls, recurring sessions) |
| App State Storage | Firebase / Firestore (session state, memory graph, flow definitions, tenant config) |
| Usage Tracking + Analytics | BigQuery (append-only usage event ledger, cost attribution, billing sync) |
| Billing | Stripe (subscriptions, seats, usage metering, invoices) |
| Container Registry | Google Artifact Registry |
| Telephony | Twilio first (media streams, phone numbers, SIP), adapter-ready for future providers |
| Voice Providers | OpenAI Realtime API, Gemini Live, ElevenLabs (extensible) |
| Connector Layer | Outbound connector gateway + per-tenant secrets for third-party systems |
| SDKs | JavaScript (TypeScript-first), Python |

### 6.2 Usage Tracking Architecture

Usage tracking is critical for billing accuracy, cost attribution, and platform economics. The architecture separates real-time app state from usage analytics:

**Firestore** handles real-time application state:
- Session state and active conversation data
- Flow definitions and tenant configuration
- Memory graph (per-user, per-session, cross-session)
- Authentication and access control

**BigQuery** handles the append-only usage event ledger:
- Every API call, voice minute, workflow run, and extraction event is appended as an immutable event
- Events flow from Firebase Functions into BigQuery via Pub/Sub
- Billing sync: aggregated usage is computed from BigQuery and synced to Stripe for invoicing
- Cost attribution: per-call, per-workflow, per-provider cost breakdowns
- Analytics dashboard queries run against BigQuery, not Firestore

**Usage event schema:**

```json
{
  "event_id": "uuid",
  "tenant_id": "string",
  "project_id": "string",
  "event_type": "voice_minute | workflow_run | extraction | api_call | telephony_minute",
  "provider": "openai | gemini | elevenlabs | twilio",
  "duration_ms": 0,
  "tokens_in": 0,
  "tokens_out": 0,
  "provider_cost_usd": 0.00,
  "platform_fee_usd": 0.00,
  "timestamp": "ISO-8601",
  "metadata": {}
}
```

**Billing sync flow:**
1. Usage events are appended to BigQuery in near-real-time via Pub/Sub
2. A scheduled aggregation job computes per-tenant usage totals (hourly)
3. Aggregated usage is reported to Stripe Meters for usage-based billing
4. Invoices combine platform subscription fee + seat charges + usage overages + pass-through with markup

### 6.3 Deployment Modes

**Phase 1 (Launch): Multi-Tenant Shared Infrastructure**
- All tenants run on shared Google Cloud infrastructure
- Logical isolation per tenant (data, secrets, configuration) — not project-level isolation
- VoiceRails hosts control plane + runtime
- Fastest onboarding: sign up, configure, deploy
- Suitable for individual developers, builders, small teams, and early-stage products
- Customers provide API keys for chosen voice providers

**Phase 2 (Post-Launch): Dedicated Customer GCP Infrastructure**
- Terraform module deploys dedicated runtime into a customer's own GCP project
- VoiceRails remains orchestration control plane
- Targeted at enterprise data-boundary, compliance, and performance isolation needs
- Clear migration path: apps built on shared infrastructure can be migrated to dedicated infrastructure without code changes
- Additional managed hosting fees for dedicated infrastructure operation
- Entry criteria: customer on enterprise plan, compliance or data residency requirement documented

### 6.4 Terraform Module Blueprint (Customer GCP, Phase 2)

```hcl
module "platform_voice_stack" {
  source = "github.com/[platform]/terraform-voice-stack"

  project_id       = var.gcp_project_id
  region           = var.region  # default: europe-west2
  voice_providers  = ["openai", "gemini"]
  enable_telephony = true
  enable_scheduler = true
}
```

**Provisions:**
- API enablement (Cloud Run, Secret Manager, Pub/Sub, Scheduler, Cloud Build, Artifact Registry)
- Service accounts with minimum-privilege IAM roles
- Artifact Registry repository for bridge container images
- Cloud Run service for the telephony bridge
- Secret Manager entries for all provider keys and shared secrets
- Optional Pub/Sub topics + Cloud Scheduler jobs for scheduled calls

**Outputs:**
- Bridge URL
- Webhook endpoints
- Service account identifiers
- Health check URLs

### 6.5 Telephony Number Provisioning APIs (Twilio First)

VoiceRails must allow developers to manage numbers in-platform rather than in provider consoles for supported regions:

- Search available numbers by country/jurisdiction, capability, type
- Reserve and provision/purchase numbers through provider APIs
- Assign numbers to workflows and environments
- Enforce staged country allowlist and compliance prerequisites
- Expose full audit trail for provisioning actions

Initial launch posture:
- **Provider:** Twilio only
- **Countries:** US, G7, and selected European countries via staged allowlist
- **Porting:** Not in v1 (planned phase 2+)

### 6.6 SDK Architecture

**JavaScript SDK (primary):**
- Connects to VoiceRails serverless backend on Google Cloud
- Session management, voice provider configuration, workflow invocation
- Real-time event streaming for extraction progress and conversation state
- TypeScript-first with full type definitions

**Python SDK:**
- Equivalent functionality for Python-based applications and Django framework integration
- Async support for real-time streaming
- Suitable for backend integrations, data pipelines, and server-side voice applications

Both SDKs abstract the full platform capability set: voice provider selection, telephony, workflow execution, extraction, memory, and analytics.

### 6.7 CLI Developer Experience

```bash
# Initialise — collects project, region, provider choices, telephony config
platform init

# Dry-run — validates infrastructure plan and configuration
platform plan

# Deploy — applies Terraform, deploys containers, prints endpoints
platform deploy

# Verify — runs health checks across all deployed services
platform verify
```

**Target: <30 minutes from empty GCP project to first live call.**

### 6.8 Secure Connector Access to Tenant Systems

To support writes into tenant-owned infrastructure (databases, queues, APIs), VoiceRails provides:

- Tenant-scoped connector definitions (JSON schema + auth type + endpoint)
- Secret storage in Secret Manager (never exposed to client runtime)
- Egress controls (allowlists, TLS-only, optional static egress IP)
- Per-connector IAM scopes and per-workflow permissions
- Signed connector invocation with idempotency keys and audit logs
- Retry policies, circuit breakers, and dead-letter handling

Initial connector support focus:
- HTTPS/webhook connectors (custom APIs and internal services)
- Database connectors for tenant-owned stores (via secure service credentials and network controls)
- Queue/event connectors for async integration patterns

---

## 7. Ideal Customer Profile

### 7.1 Primary ICP — Technical Developer

Product teams with 2–20 engineers shipping voice features in:

- **Health and wellness coaching** — AI coaches, therapy support, nutrition guidance
- **Recruiting and interview automation** — screening calls, structured interviews
- **Sales enablement and call QA** — AI SDRs, call scoring, coaching nudges
- **Learning and tutoring** — language practice, exam prep, interactive courses
- **Support triage and intake** — first-line voice agents, appointment scheduling
- **Internal tooling** — voice-driven data entry, field reporting, compliance checks

### 7.2 Primary ICP — Non-Technical Builder

Domain experts and business owners building voice experiences in:

- **Coaching and consulting** — client intake, session check-ins, progress tracking
- **Research and data collection** — qualitative interviews, user research, survey alternatives
- **Onboarding and training** — employee onboarding conversations, knowledge assessment
- **Customer engagement** — personalised outreach, feedback collection, appointment booking
- **Healthcare intake** — patient history gathering, symptom assessment, triage support

### 7.3 Buying Signals

- Already tested one voice model (OpenAI Realtime, Gemini Live) and want production infrastructure
- Need both in-app and phone call experiences from the same platform
- Have a strong domain model and need structured post-call data flowing back into their system
- Currently spending engineering time on infrastructure plumbing instead of conversation design
- Evaluating Twilio, Vonage, or Vapi but want more control over the AI layer
- Non-technical user who wants to build a voice experience without hiring a developer
- Agency building voice solutions for multiple clients and needing a multi-tenant platform

### 7.4 Anti-Patterns (Not Our Customer Yet)

- Companies looking for a fully managed, outcome-guaranteed service
- Teams needing on-premise deployment with no cloud connectivity (Phase 2 dedicated GCP addresses some of this)

---

## 8. Packaging and Pricing

### 8.1 Account Model

- **Individual account (default):** one builder can create and operate services.
- **Team account (upgrade trigger):** required when inviting collaborators; includes seat-based pricing per added team member.
- Team features (RBAC, audit logs, multi-user workflows) are locked to Team+ plans.
- Upgrade rule: adding a second platform member triggers Team billing model and seat pricing.

### 8.2 Tiers

| Capability | **Starter (Individual)** | **Build (Individual/Small Team)** | **Launch (Team)** | **Scale (Enterprise Team)** |
|-----------|----------------------------|-----------------------------------|--------------------|-----------------------------|
| Real-time voice API abstraction | ✓ | ✓ | ✓ | ✓ |
| Single voice provider | ✓ | Multi-provider | Multi-provider | Multi-provider |
| Visual flow designer | ✓ (basic) | ✓ | ✓ | ✓ |
| Intelligent extraction blocks | — | ✓ | ✓ | ✓ |
| Basic telephony bridge templates | — | ✓ | ✓ | ✓ |
| In-platform number provisioning (Twilio) | — | ✓ | ✓ | ✓ |
| Team collaboration + member seats | — | Limited | ✓ | ✓ |
| Standard logs + dashboard | ✓ (basic) | ✓ | ✓ | ✓ |
| Sandbox / test environment | — | ✓ | ✓ | ✓ |
| Managed workflow engine | — | — | ✓ | ✓ |
| Structured memory + extraction | — | — | ✓ | ✓ |
| Alerts, retries, cost analytics | — | — | ✓ | ✓ |
| Multi-environment deployments | — | — | — | ✓ |
| Dedicated GCP infrastructure | — | — | — | ✓ |
| Dedicated throughput | — | — | — | ✓ |
| SSO, audit exports, enterprise controls | — | — | — | ✓ |
| Support | Docs only | Community | SLA-backed | Dedicated |

### 8.3 Pricing Components

| Component | Description |
|-----------|-------------|
| **Platform fee** | Monthly fee by tier |
| **Team seat fee** | Per added collaborator on Team+ plans |
| **Usage fee** | Included minutes by tier; overage per minute and optional per-workflow-run pricing |
| **Infrastructure pass-through** | Telephony + voice provider costs passed through at **cost + markup** (baseline 20%, validated by tier economics) |

### 8.4 Illustrative Pricing (Subject to Validation)

| Tier | Platform Fee | Team Seat Fee | Included Minutes | Overage |
|------|-------------|---------------|------------------|---------|
| Starter | $9.99/mo | N/A | 60 real-time minutes | $0.12/min |
| Build | $99/mo | $0–$10/seat (limited seats) | 500 real-time minutes | $0.08/min |
| Launch | $499/mo | $20/seat | 3,000 real-time minutes | $0.06/min |
| Scale | Custom | Custom | Custom | Custom |

*All prices in USD. Excludes infrastructure pass-through costs.*

### 8.5 Billing Infrastructure (Stripe-First)

- Stripe Billing for subscriptions, seat billing, and invoice lifecycle
- Stripe Meters for usage-based billing (minutes, workflow runs, overages)
- Webhook-driven entitlements sync into VoiceRails control plane
- Add-on pricing support for premium connectors or dedicated throughput
- Global tax handling via Stripe Tax where required

### 8.6 Billing Mechanics (How Charges Are Calculated)

Each invoice combines four components:

1. **Base platform subscription fee** (tier-dependent)
2. **Team seat charges** (for Team+ plans, per active collaborator)
3. **Usage overages** (minutes/workflow runs above included plan allowance)
4. **Pass-through usage with markup** (voice provider + telephony costs)

Target implementation approach:
- Use Stripe subscription items for base plan + seats
- Use Stripe metered billing for overage events
- Usage events flow into BigQuery as the canonical cost ledger, then aggregated totals sync into Stripe invoice items
- Keep pass-through line items transparent so customers can see provider cost and markup logic

### 8.7 Commercial Principles

- Pricing is infrastructure-native and easy to forecast — no surprises
- Pass-through markup is transparent and stated upfront
- No outcome-based pricing in v1 — the platform sells reliability, not results
- Annual plans offered once reliability KPIs stabilise (target: 6 months post-launch)

---

## 9. Competitive Landscape

| Competitor | Strength | VoiceRails Advantage |
|-----------|----------|----------------------|
| **Vapi** | Quick voice agent setup, growing ecosystem | Deeper workflow customisation, structured memory, visual builder for non-technical users, self-hosted option |
| **Retell AI** | Good telephony integration | Multi-provider orchestration, tool-calling abstraction, intelligent extraction, transparent pricing |
| **Bland AI** | Enterprise telephony focus | Developer control, provider flexibility, not locked to one model |
| **Vocode** | Open-source voice framework | Managed infrastructure, deployment automation, production ops tooling, visual designer |
| **Raw Provider APIs** (OpenAI, Google) | Maximum flexibility | Abstraction layer saves months of integration work, telephony included, hot-swap between providers |
| **Typeform / Jotform** | Easy form building for non-technical users | Voice-native data collection that extracts richer, more nuanced information through natural conversation vs static forms |
| **Traditional IVR builders** | Established telephony workflows | AI-powered natural conversation vs rigid menu trees; intelligent extraction vs form-filling |

**Defensibility comes from:**
- Provider abstraction that survives model drift and breaking changes
- Telephony-runtime reliability under real production call volumes
- Intelligent extraction engine — conversational data gathering that goes far beyond form-filling
- Visual flow designer that opens the market beyond developers
- Structured memory schema depth and extraction quality
- Deployment automation with secure-by-default infrastructure templates
- Dual access paths (SDK + visual designer) creating network effects across technical and non-technical users
- Operational tooling (cost visibility, latency tracking, call diagnostics) that competitors treat as afterthoughts
- High-quality developer UX for quick setup, stable scaling, and low migration pressure once integrated
- Deep connector + workflow customisation without locking customers into one data backend

---

## 10. Go-To-Market Strategy

### 10.1 Launch Wedge

> "Ship production voice + phone agents in days, not quarters."

### 10.2 Channel Strategy

**Developer-first:**
- Comprehensive docs site with quickstart guides for each vertical
- Open-source reference implementations and starter templates
- JavaScript and Python SDK documentation with examples
- Active presence in AI/voice developer communities (Discord, Twitter/X, Hacker News)
- Technical blog content: "How we handle provider failover" / "Structured memory for voice agents" / "Hot-swap voice providers in production"

**Builder-first:**
- Visual flow designer tutorials and template gallery
- "Build a voice intake experience in 10 minutes" walkthrough videos
- Case studies showing non-technical users building production voice apps
- Template marketplace with pre-built extraction schemas for common use cases (health intake, client onboarding, research interviews)

**Partner-led:**
- AI consultancies and product agencies as referral partners
- Voice provider partnerships (featured in OpenAI/Google ecosystems)
- Integration partnerships with CRM and health platforms

**Content + community:**
- "Build a production voice agent in 30 minutes" video series
- Monthly office hours / live builds
- Case studies from design partners
- Community forum for developers and builders to swap ideas and troubleshoot

### 10.3 Sales Motion

| Tier | Motion |
|------|--------|
| Starter | Self-serve signup, docs-only, credit card checkout |
| Build | Self-serve signup, docs-driven onboarding |
| Launch | Founder-led or solutions-engineer-assisted onboarding |
| Scale | Direct sales, custom SLA negotiation |

### 10.4 Design Partner Programme (Pre-Launch)

Recruit 5–8 design partners across at least 3 verticals and both user types (developers and non-technical builders). Offer:
- Free Launch-tier access for 6 months
- Direct Slack channel with engineering team
- Influence on API design, visual designer UX, and feature prioritisation
- Case study rights upon launch

---

## 11. 90-Day Execution Plan

### Days 0–30: Foundation

| Track | Deliverable |
|-------|------------|
| API | Finalise contracts for realtime sessions, telephony, JSON workflows, extraction schemas, connector actions |
| Infrastructure | Harden multi-tenant shared runtime for launch |
| Visual Designer | Ship MVP canvas with Start, Extraction, Condition, Action, and End blocks |
| SDKs | Ship JavaScript SDK v0.1 with session management, provider selection, and workflow invocation |
| Auth | Google and GitHub SSO for developer signup |
| Docs | Publish onboarding documentation and reference architecture |
| Design Partners | Identify and recruit first 3 design partners (mix of developer and builder personas) |
| Brand | Finalise platform name, secure domain, create initial brand assets |

### Days 31–60: Tooling + First Users

| Track | Deliverable |
|-------|------------|
| CLI | Ship CLI wrapper (`init` / `plan` / `deploy` / `verify`) |
| Visual Designer | Add Memory, Prompt, and Handoff blocks; flow simulation and preview |
| SDKs | Ship Python SDK v0.1; JavaScript SDK v0.2 with extraction and memory APIs |
| Extraction Engine | Ship intelligent extraction with real-time completion tracking and post-call reports |
| Observability | Launch baseline dashboard: latency, cost, error rates, extraction completion scores |
| Billing | Stripe subscriptions + seat billing + usage metering (BigQuery → Stripe sync) + markup pass-through |
| Telephony | Ship Twilio number search/provision/assign APIs with staged country allowlist |
| Partners | Onboard 3–5 design partners across two verticals |
| Docs | Publish vertical-specific quickstart guides and visual designer tutorials |

### Days 61–90: Productisation

| Track | Deliverable |
|-------|------------|
| Reliability | Harden deployment rollback and upgrade flows |
| Visual Designer | Template gallery, flow export/import, custom block registration API |
| Sandbox | Ship test environment for builders and developers |
| Pricing | Publish pricing page and tier comparison |
| Launch | Open self-serve Build tier with gated Launch onboarding |
| Connectors | General availability for secure tenant-owned DB/API connectors |
| Marketing | Ship landing page, first case study, launch blog post |
| Metrics | Instrument all success metrics (see Section 12) |

---

## 12. Success Metrics

### Product Metrics

| Metric | Target |
|--------|--------|
| Time to first successful call after signup | < 30 minutes |
| Time to first visual-designer flow deployed | < 15 minutes |
| Call-to-extraction success rate | > 95% |
| Extraction completion score (fields populated vs defined) | > 80% average |
| Median end-to-end call latency | Within provider SLA + < 200ms platform overhead |
| Provider failover success rate | > 99% |

### Business Metrics

| Metric | Target (6-month) |
|--------|------------------|
| Design partner retention | 100% through programme |
| Starter → Build conversion | > 30% |
| Build → Launch conversion | > 25% |
| Launch account expansion (MoM usage growth) | > 15% |
| Gross margin after provider + telephony pass-through | > 65% |
| Team plan expansion (seats/account) | > 20% growth in qualifying cohorts |
| 90-day paid retention | > 85% |
| Visual designer adoption (% of active users using designer) | > 40% |

### Operational Metrics

| Metric | Target |
|--------|--------|
| Incident frequency | < 5 per 1,000 calls |
| Mean time to detect call failures | < 60 seconds |
| Mean time to resolve | < 15 minutes |
| Cost variance vs projected usage | < 10% |

---

## 13. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| Voice provider breaking changes | High | High | Abstraction layer with versioned adapters; automated integration tests per provider |
| Twilio pricing changes or outages | Medium | Medium | Abstract telephony layer to support alternative providers (Vonage, Telnyx) |
| Low initial demand / slow adoption | High | Medium | Design partner programme validates product-market fit before public launch; dual persona approach (developer + builder) widens addressable market |
| Visual designer complexity creep | Medium | Medium | Strict block-based model; complex logic stays in SDK; designer compiles to same JSON format |
| Pricing perceived as expensive vs DIY | Medium | Medium | ROI calculator showing engineering time saved; free Starter tier for adoption |
| Security incident in hosted mode | Critical | Low | SOC 2 readiness from day one; Phase 2 dedicated GCP mode as alternative |
| Multi-tenant noisy neighbour | Medium | Medium | Resource quotas per tenant; rate limiting; monitoring for anomalous usage |
| Team capacity (small team, big scope) | High | High | Ruthless scope control in 90-day plan; visual designer MVP is blocks + canvas only; defer Scale tier features |
| Connector misuse / data exfiltration via external integrations | Critical | Medium | Connector sandboxing, egress controls, scoped secrets, audit logs, tenant-level policy enforcement |
| Extraction quality inconsistency across providers | Medium | Medium | Provider-agnostic extraction pipeline; extraction testing suite; quality benchmarks per provider |

---

## 14. v2 Decision Log

### 14.1 Locked Decisions (Confirmed)

1. **Deployment posture at launch:** Multi-tenant shared GCP infrastructure (dedicated customer GCP deferred to Phase 2).
2. **Control plane stack:** Firebase-first.
3. **Launch voice provider set:** OpenAI Realtime + Gemini Live + ElevenLabs (extensible).
4. **Launch telephony provider:** Twilio only, with adapter pattern for future providers.
5. **Workflow definition format:** JSON (n8n-style) — used by both SDK and visual designer.
6. **Billing stack:** Stripe for subscriptions, seats, usage metering, and invoicing.
7. **Commercial shape:** platform fee + team seat fees + usage overage + provider/telephony pass-through markup.
8. **Telephony number management:** full API/UI-based number provisioning in-platform for supported regions.
9. **Country rollout strategy:** staged allowlist starting with US, G7, and selected European countries.
10. **Number porting:** not in v1; evaluate in Phase 2.
11. **Usage tracking:** BigQuery as append-only usage event ledger; Firestore for real-time app state. Separation confirmed.
12. **Visual flow designer:** confirmed as v1 launch feature (not deferred to Phase 2).
13. **Intelligent extraction engine:** confirmed as v1 launch feature — core differentiator.
14. **SDK languages:** JavaScript (TypeScript-first) and Python at launch.
15. **Authentication:** Google and GitHub SSO for developer/builder signup.
16. **Non-technical builders:** confirmed as a primary user persona — visual designer is the access path.
17. **Hosted apps for builders:** non-technical users can build and host voice apps on the shared platform without managing infrastructure.

### 14.2 Remaining Decisions

1. **Platform name** — select from candidates and secure domain.
2. **Exact markup policy** — fixed percentage vs tier-dependent percentage.
3. **Final country allowlist** — exact country-by-country list and compliance requirements.
4. **Support SLA matrix** — response times and escalation by tier.
5. **Timeline for dedicated GCP mode** — entry criteria and milestone definition.
6. **Initial connector catalog for GA** — final list of first-party supported connectors vs BYO webhook-only baseline.
7. **Visual designer block extensibility model** — how developers register custom blocks.
8. **Template marketplace model** — free vs paid templates, community contributions.
9. **Pricing tier review** — validate tier structure and price points against market and unit economics.

---

## 15. Relationship to Flank

VoiceRails is the infrastructure layer. Flank is a vertical application (AI coaching) built on top of it.

This separation is strategic:

- Flank validates the platform under real production load with real users
- VoiceRails captures value from every team building voice AI, not just coaching
- Flank becomes a reference implementation and case study for VoiceRails — demonstrating both the SDK path (Flank's custom coaching logic) and the extraction engine (cognitive profiling, belief graph)
- Revenue diversification: Flank earns from end-user subscriptions; VoiceRails earns from developer infrastructure
- Flank's daily check-in, coaching session, and task planning features demonstrate the conversation memory and cross-session continuity that the platform provides as primitives

Over time, Flank's coaching-specific features (cognitive profiling, biometric integration, health memory schemas) remain proprietary while the underlying voice infrastructure becomes the developer platform.

---

*End of document.*
