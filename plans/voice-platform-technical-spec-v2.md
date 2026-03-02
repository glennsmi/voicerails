# VoiceRails — Platform Technical Specification

**Version:** 2.0  
**Date:** 2026-03-01  
**Status:** Draft — aligned with PRD v2  
**Supersedes:** `old docs/voice-platform-technical-spec.md` (v1)

---

## 1. Purpose and Scope

This document defines the platform engineering architecture for VoiceRails: multi-tenancy, data model, access control, provisioning, security, observability, and billing infrastructure. It covers the concerns that sit between the product requirements (PRD) and the runtime implementation details (implementation guide).

**This document covers:**
- Multi-tenancy model and tenant hierarchy
- Firestore data model (all collection paths)
- Access control and API key management
- Telephony abstraction and number lifecycle
- Billing and metering pipeline (Firestore → BigQuery → Stripe)
- Provisioning and infrastructure automation
- Security baseline and compliance controls
- Observability, SLOs, and telemetry
- Connector runtime for tenant system integration

**Covered by companion documents (not repeated here):**

| Concern | Document |
|---------|----------|
| Product requirements, positioning, pricing, go-to-market | [voice-infrastructure-prd-v2.md](voice-infrastructure-prd-v2.md) |
| Connection layer, provider adapters, event schema, audio pipeline, VAD | [voice-platform-implementation-guide.md](voice-platform-implementation-guide.md) |
| SDK API surface, workflow JSON format, webhooks, CLI, project structure | [voice-sdk-developer-experience-spec.md](voice-sdk-developer-experience-spec.md) |
| Voice experience controls and provider translation | [voice-experience-controls-spec.md](old%20docs/voice-experience-controls-spec.md) |

---

## 2. Platform Architecture

### 2.1 Two Planes

**A) Control Plane (Platform-Owned, Centralised)**

Runs on VoiceRails-managed infrastructure in all deployment modes. Responsibilities:

- Tenant lifecycle (signup, org/app/env creation, member management)
- API key issuance, rotation, and scoping
- Provider credential storage and validation
- Workflow definition storage, versioning, and deployment promotion
- Visual flow designer backend (compile, store, version)
- Extraction schema storage and validation
- Memory engine coordination
- Telephony number lifecycle management
- Metering aggregation, billing sync to Stripe, and usage dashboards
- Observability, alerting, and incident management
- Connector registry and egress policy enforcement

Control plane services (logical, not necessarily separate deployments):

| Service | Responsibility |
|---------|---------------|
| `auth-service` | Google/GitHub SSO, API key issuance, RBAC |
| `tenant-service` | Org/app/env CRUD, member management, entitlements |
| `workflow-service` | Workflow definitions, versions, deployment promotion, visual designer compile |
| `provider-config-service` | Voice provider and telephony provider credential management |
| `telephony-service` | Number search, provision, assign, release, compliance bundles |
| `billing-service` | Usage ingestion, Stripe sync, invoice lifecycle, pass-through calculation |
| `connector-service` | Connector registry, egress policy, secret management |
| `ops-service` | Logs, alerts, health, incident tracking, SLO dashboards |

**B) Runtime Plane (Per Tenant Environment)**

Executes voice sessions and telephony calls. In hosted mode, shared infrastructure with logical tenant isolation. In dedicated mode, deployed into the customer's GCP project.

Runtime components:

| Component | Technology | Role |
|-----------|-----------|------|
| Session API | Firebase Functions v2 (`europe-west2`) | Session create, finalise, event ingestion |
| Telephony bridge | Cloud Run (WebSocket) | Twilio media stream ↔ voice provider |
| Workflow interpreter | Firebase Functions v2 | Stage execution, prompt resolution, tool routing |
| Extraction engine | Firebase Functions v2 | Real-time extraction tracking, post-session extraction |
| Memory engine | Firebase Functions v2 + Firestore | Per-user, per-session, cross-session state |
| Event bus | Google Pub/Sub | Async events, post-call pipeline, usage event fan-out |
| Scheduler | Google Cloud Scheduler | Scheduled outbound calls, recurring sessions |
| State store | Firestore | Session state, tenant config, memory graph |
| Usage sink | BigQuery (via Pub/Sub) | Append-only usage event ledger |

### 2.2 Deployment Modes

**Phase 1 (Launch): Multi-Tenant Shared Infrastructure**

All tenants run on shared Google Cloud infrastructure managed by VoiceRails.

- Logical isolation per tenant (data partitioning, scoped secrets, per-tenant quotas)
- Fastest onboarding: sign up, configure provider keys, start sessions
- Suitable for individual developers, non-technical builders, small teams, early-stage products
- Customers provide their own API keys for voice providers

**Phase 2 (Post-Launch): Dedicated Customer GCP Infrastructure**

Terraform module deploys dedicated runtime into a customer's own GCP project.

- Control plane remains centralised on VoiceRails
- Runtime components (Functions, Cloud Run, Firestore, Pub/Sub) run in customer project
- Targeted at enterprise data residency, compliance, and performance isolation requirements
- Clear migration path: apps on shared infra migrate to dedicated without code changes
- Entry criteria: enterprise plan, documented compliance or data residency requirement

---

## 3. Multi-Tenancy Model

### 3.1 Tenant Hierarchy

```
Organization (customer company)
  └── Application (voice app/product)
        └── Environment (dev, staging, production)
              └── End User (final user being spoken to)
```

- **Organization:** billing entity, member management, SSO. One org per signup by default; agencies/teams can have multiple apps under one org.
- **Application:** a distinct voice product or use case. Has its own provider config, workflows, telephony numbers, and extraction schemas.
- **Environment:** isolated config and data within an app. Workflows are promoted between environments. Separate API keys per environment.
- **End User:** the person the voice agent speaks to. Platform-assigned or customer-provided ID. Memory, session history, and extraction results are scoped per end user.

### 3.2 Data Partitioning

All runtime data includes at minimum:
- `orgId`
- `appId`
- `envId`
- `endUserId` (where applicable)

Firestore partitioning for hosted mode:
```
orgs/{orgId}/apps/{appId}/envs/{envId}/...
```

For dedicated mode: same logical schema, physically isolated in the customer's GCP project.

### 3.3 Access Control

| Context | Auth Mechanism | Scope |
|---------|---------------|-------|
| Dashboard / Console | Google or GitHub SSO (Firebase Auth) | Org-level, role-based |
| SDK (server-side) | API key (`vr_live_...`, `vr_test_...`) | Environment-level |
| SDK (browser) | Ephemeral session token (issued by backend) | Session-level, short-lived |
| Telephony bridge → control plane | Signed shared secret or JWT | Service-level |
| Webhooks (outbound) | HMAC-SHA256 signature | Per-webhook-endpoint |
| CLI | OAuth login → cached token | Org-level |

**API key model:**
- Each environment has its own API key pair (live + test)
- Keys are prefixed: `vr_live_` (production), `vr_test_` (sandbox)
- Keys can be rotated without downtime (dual-key window)
- Keys carry embedded `orgId`, `appId`, `envId` for request scoping

**RBAC roles (per org):**

| Role | Permissions |
|------|------------|
| Owner | Full access, billing, member management, delete org |
| Admin | App/env CRUD, provider config, workflow deploy, number management |
| Developer | Workflow authoring, session management, analytics read |
| Builder | Visual designer, extraction schema design, analytics read |
| Viewer | Read-only access to sessions, analytics, logs |

---

## 4. Firestore Data Model

### 4.1 Control Plane Collections

```
orgs/{orgId}
  ├── name, plan, billingStripeCustomerId, createdAt
  │
  ├── members/{memberId}
  │     ├── userId, email, role, invitedAt, joinedAt
  │
  ├── apps/{appId}
  │     ├── name, description, region, defaultProvider, createdAt
  │     │
  │     ├── environments/{envId}
  │     │     ├── name, type (dev|staging|production), apiKeyHash, webhookUrls, createdAt
  │     │
  │     ├── providers/{providerConfigId}
  │     │     ├── provider (openai|gemini|elevenlabs|grok), credentialSecretRef, status, lastVerifiedAt
  │     │
  │     ├── workflows/{workflowId}
  │     │     ├── name, description, currentVersionId, deployedVersions (by env), createdAt
  │     │     │
  │     │     └── versions/{versionId}
  │     │           ├── definition (WorkflowDefinition JSON), createdAt, createdBy, notes
  │     │
  │     ├── telephonyProviders/{telephonyConfigId}
  │     │     ├── provider (twilio), credentialSecretRef, accountSid, status
  │     │
  │     ├── phoneNumbers/{numberId}
  │     │     ├── e164, provider, providerResourceId, countryCode, jurisdiction
  │     │     ├── numberType (local|mobile|toll_free), capabilities[]
  │     │     ├── lifecycleStatus (available|reserved|provisioning|active|suspended|releasing|released)
  │     │     ├── monthlyRecurringCostMicros, currency
  │     │     ├── assignment { envId, workflowId, routeProfile }
  │     │     ├── complianceBundleId, complianceStatus
  │     │     ├── provisionedAt, lastHealthCheckAt
  │     │
  │     ├── complianceBundles/{bundleId}
  │     │     ├── country, provider, businessName, documents[], verificationStatus
  │     │     ├── submittedAt, reviewedAt, expiresAt
  │     │
  │     ├── connectors/{connectorId}
  │     │     ├── name, type (webhook|database|queue), endpoint, authType
  │     │     ├── credentialSecretRef, egressPolicy, retryPolicy
  │     │     ├── allowedWorkflows[], status
  │     │
  │     ├── extractionSchemas/{schemaId}
  │     │     ├── name, outcomes[], completionThreshold, conversationStyle
  │     │
  │     ├── experienceControlProfiles/{profileId}
  │     │     ├── name, controls (VoiceExperienceControls), providerOverrides
  │     │
  │     └── webhooks/{webhookId}
  │           ├── url, events[], secretHash, environment, status, createdAt
  │
  └── billingEvents/{eventId}  (tenant mirror — append-only)
        ├── eventType, provider, durationMs, providerCostUsd, platformFeeUsd
        ├── appId, envId, sessionId, callSid, workflowVersionId
        ├── timestamp, pricingSnapshotId, status (estimated|final)
```

### 4.2 Runtime Collections (Per Environment)

```
orgs/{orgId}/apps/{appId}/envs/{envId}/
  │
  ├── sessions/{sessionId}
  │     ├── status (active|extracting|completed|failed)
  │     ├── provider, model, voice, channel (in_app|telephony)
  │     ├── endUserId, workflowId, workflowVersionId
  │     ├── experienceControlProfileId
  │     ├── startedAt, endedAt, durationSeconds
  │     ├── metadata {}
  │     │
  │     ├── messages/{messageId}
  │     │     ├── role (user|assistant), content, timestamp, index
  │     │
  │     ├── toolEvents/{eventId}
  │     │     ├── callId, name, args, output, timestamp, durationMs
  │     │
  │     └── extractions/{extractionId}
  │           ├── schemaId, completionScore, fields {}, confidence {}, timestamp
  │
  ├── calls/{callId}
  │     ├── sessionId, callSid, to, from, status, trigger (on_demand|scheduled|inbound)
  │     ├── startedAt, endedAt, durationSeconds, provider
  │
  ├── memory/users/{endUserId}
  │     ├── entries/{key}
  │     │     ├── value, scope (user|app), updatedAt, source (manual|auto)
  │     │
  │     └── sessionSummaries/{sessionId}
  │           ├── summary, topics[], extractionSnapshot, createdAt
  │
  └── memory/app/{key}
        ├── value, updatedAt
```

### 4.3 Canonical Billing Ledger (Global)

```
billingEvents/{eventId}  (append-only, global)
  ├── orgId, appId, envId
  ├── eventType (voice_minute|workflow_run|extraction|api_call|telephony_minute)
  ├── provider, model
  ├── channel (voice_web|voice_phone)
  ├── sessionId, callSid, workflowVersionId
  ├── durationMs, tokensIn, tokensOut
  ├── providerCostUsd, platformFeeUsd, telephonyCostUsd
  ├── timestamp
  ├── pricingSnapshotId
  ├── status (estimated|final)
  ├── region, numberJurisdiction
```

### 4.4 BigQuery Datasets

| Dataset | Tables | Source |
|---------|--------|--------|
| `usage_events` | `events` | Pub/Sub streaming from billing event writes |
| `cost_events` | `events` | Enriched usage events with resolved pricing |
| `session_aggregates` | `daily`, `weekly`, `monthly` | Scheduled aggregation jobs |
| `provider_quality_metrics` | `latency`, `errors`, `vad_quality` | Structured log export |

---

## 5. Telephony Abstraction

### 5.1 Telephony Adapter Contract

```typescript
interface TelephonyAdapter {
  readonly provider: TelephonyProvider;

  searchNumbers(input: NumberSearchInput): Promise<AvailableNumber[]>;
  reserveNumber(input: NumberReserveInput): Promise<ReservedNumber>;
  provisionNumber(input: NumberProvisionInput): Promise<ProvisionedNumber>;
  assignNumber(numberId: string, input: NumberAssignInput): Promise<void>;
  releaseNumber(numberId: string): Promise<void>;

  createOutboundCall(input: OutboundCallInput): Promise<OutboundCallResult>;
  buildMediaStreamPayload(input: MediaStreamInput): string;

  startPhoneVerification?(input: VerifyStartInput): Promise<VerifyStartResult>;
  checkPhoneVerification?(input: VerifyCheckInput): Promise<VerifyCheckResult>;

  submitComplianceBundle?(input: ComplianceBundleInput): Promise<ComplianceBundleResult>;
  getComplianceStatus?(bundleId: string): Promise<ComplianceStatus>;
}

type TelephonyProvider = 'twilio' | 'telnyx' | 'vonage' | 'sip';
```

### 5.2 Provider Roadmap

| Phase | Provider | Scope |
|-------|----------|-------|
| v1 (launch) | Twilio | Full: numbers, calls, media streams, compliance bundles, Verify |
| v2 | Telnyx | Numbers + calls (media streams if WebSocket-compatible) |
| v2 | Vonage | Numbers + calls |
| v3 | SIP trunk | Custom SIP for enterprise PSTN connectivity |

### 5.3 Number Lifecycle

```
Available → Reserved (short TTL) → Provisioning → Active → Releasing → Released
                                        ↓
                                   Suspended (compliance issue)
```

Each state transition is audit-logged with actor, timestamp, and reason.

### 5.4 Number Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `numberId` | string | Platform ID |
| `providerResourceId` | string | Twilio SID / provider reference |
| `e164` | string | E.164 format number |
| `provider` | string | Telephony provider |
| `countryCode` | string | ISO 3166-1 alpha-2 |
| `jurisdiction` | string | Sub-national region if applicable |
| `numberType` | enum | `local`, `mobile`, `national`, `toll_free` |
| `capabilities` | string[] | `voice_inbound`, `voice_outbound`, `sms` |
| `monthlyRecurringCostMicros` | number | Cost in micros (USD cents × 10000) |
| `currency` | string | ISO 4217 |
| `lifecycleStatus` | enum | See lifecycle above |
| `assignment` | object | `{ envId, workflowId, routeProfile }` |
| `complianceBundleId` | string | Reference to compliance bundle |
| `complianceStatus` | enum | `not_required`, `pending_review`, `approved`, `rejected`, `expired` |

### 5.5 Jurisdiction and Compliance

Platform requirements for number procurement:

1. Maintain a per-provider capability matrix by country/jurisdiction (searchable inventory, reservation support, compliance API support, port-in/out support)
2. Show regulatory requirements before purchase attempt
3. Collect and store business/legal fields and documents via compliance bundles
4. Sync compliance artifacts to provider APIs
5. Track verification states and alert before expiry
6. Block number assignment/use when compliance is not valid
7. Separate PII/document storage from runtime call data with strict access policies

**v1 country allowlist:** US, UK, Canada, France, Germany, Italy, Japan (G7) + selected EU countries. Staged rollout, reviewed quarterly.

### 5.6 Developer Console — Telephony Numbers UI

| Panel | Functionality |
|-------|-------------|
| Search | Country/jurisdiction, type, capability, provider filters |
| Availability | Number, locality, monthly cost, features, regulatory requirements |
| Provision wizard | Compliance pre-check, reserve/provision actions, error recovery |
| Assignment | Bind number to environment + workflow route |
| Operations | Health, recent calls, webhook status, release/replace |

---

## 6. Billing and Metering Pipeline

### 6.1 Event Ingestion

Every billable action writes an immutable billing event with:

- Deterministic event ID (idempotent writes)
- Pricing snapshot reference (locked at write time, survives price changes)
- `estimated` status on write, promoted to `final` after reconciliation
- Dual write: global `billingEvents/{id}` + tenant mirror `orgs/{orgId}/billingEvents/{id}`

### 6.2 Required Cost Dimensions

Every usage event must capture:

| Dimension | Purpose |
|-----------|---------|
| `orgId` / `appId` / `envId` | Tenant attribution |
| `provider` / `model` | Provider cost calculation |
| `channel` (`voice_web`, `voice_phone`) | Channel-specific pricing |
| `sessionId` / `callSid` | Drill-down to individual session/call |
| `workflowVersionId` | Workflow-level cost attribution |
| `region` | Regional pricing if applicable |
| `numberJurisdiction` | Telephony cost by country |

### 6.3 Pipeline Phases

**Phase 1 (MVP):**
- Firestore canonical ledger + tenant mirror collections
- Scheduled export job to BigQuery (hourly)
- Daily rollup generation for dashboard queries
- Manual Stripe invoice reconciliation

**Phase 2:**
- Pub/Sub streaming from billing event writes to BigQuery sink (near-real-time)
- Automated hourly Stripe Meters sync from BigQuery aggregations
- Real-time cost dashboards per tenant
- Automated invoice generation: platform fee + seats + overage + pass-through

### 6.4 Stripe Integration

| Stripe Feature | VoiceRails Use |
|---------------|---------------|
| Subscriptions | Platform fee by tier |
| Subscription items | Seat-based billing for Team+ plans |
| Meters (usage-based) | Voice minutes overage, workflow runs, telephony minutes |
| Invoice line items | Pass-through provider + telephony costs (transparent markup) |
| Stripe Tax | Global tax handling where required |
| Webhooks | Entitlement sync (plan changes, payment status) |

---

## 7. Connector Runtime

### 7.1 Purpose

Enable voice workflows to read from and write to tenant-owned systems (APIs, databases, queues) securely, without the platform storing tenant business data permanently.

### 7.2 Connector Types (v1)

| Type | Transport | Use Case |
|------|-----------|----------|
| Webhook / HTTPS | HTTP POST/GET | Custom APIs, internal services, Zapier/Make |
| Database | Secure service credentials | Tenant-owned Postgres, MySQL, MongoDB |
| Queue / Event | Pub/Sub, SQS, or webhook | Async event delivery, pipeline triggers |

### 7.3 Security Model

- Connector credentials stored in Secret Manager (never exposed to client runtime)
- Per-connector egress allowlist (TLS-only, optional static egress IP for firewall rules)
- Per-connector IAM scope and per-workflow permission binding
- Signed connector invocation with idempotency keys
- Full audit log for every invocation (args, result, duration, status)
- Retry policies with configurable backoff
- Circuit breaker per connector (trip after N failures, auto-reset after cooldown)
- Dead-letter handling for failed invocations

### 7.4 Connector Record Schema

```
orgs/{orgId}/apps/{appId}/connectors/{connectorId}
  ├── name: string
  ├── type: 'webhook' | 'database' | 'queue'
  ├── endpoint: string
  ├── authType: 'api_key' | 'oauth2' | 'basic' | 'service_account'
  ├── credentialSecretRef: string (Secret Manager path)
  ├── egressPolicy: { allowedHosts: string[], tlsRequired: boolean, staticIp: boolean }
  ├── retryPolicy: { maxRetries: number, backoffMs: number, backoffMultiplier: number }
  ├── circuitBreaker: { failureThreshold: number, resetTimeoutMs: number }
  ├── allowedWorkflows: string[] (empty = all)
  ├── status: 'active' | 'suspended' | 'error'
  ├── lastInvocationAt: timestamp
  ├── createdAt: timestamp
```

---

## 8. Provisioning and Infrastructure Automation

### 8.1 Hosted Mode Provisioning

When a developer creates an app and environment, the platform provisions:

1. Firestore namespace (`orgs/{orgId}/apps/{appId}/envs/{envId}/`)
2. API key pair (live + test) with hashed storage
3. Secret Manager namespace for provider credentials
4. Webhook endpoint registration
5. Default experience control profile
6. Environment marked `ready`

Provisioning time target: < 10 seconds.

### 8.2 Dedicated Mode Provisioning (Phase 2)

Terraform module deploys runtime into customer's GCP project:

```hcl
module "voicerails_runtime" {
  source = "github.com/voicerails/terraform-runtime-stack"

  project_id       = var.gcp_project_id
  region           = "europe-west2"
  voice_providers  = ["openai", "gemini"]
  enable_telephony = true
  enable_scheduler = true
  control_plane_url = "https://api.voicerails.dev"
}
```

**Provisions:**
1. API enablement (Cloud Run, Functions, Secret Manager, Pub/Sub, Scheduler, Artifact Registry, BigQuery)
2. Service accounts with minimum-privilege IAM roles
3. Artifact Registry repository for bridge container images
4. Cloud Run service for telephony bridge
5. Secret Manager entries for provider keys and bridge secret
6. Pub/Sub topics for event bus and usage sink
7. Cloud Scheduler jobs for scheduled calls
8. BigQuery dataset for usage events
9. Health check endpoints

**Outputs:**
- Bridge URL, webhook endpoints, service account identifiers, health check URLs

### 8.3 Terraform Module Structure

```
infrastructure/terraform/
  ├── modules/
  │     ├── runtime-core/          # Functions, Firestore rules, IAM
  │     ├── telephony-bridge/      # Cloud Run, Artifact Registry
  │     ├── event-bus/             # Pub/Sub topics, subscriptions
  │     ├── scheduling/            # Cloud Scheduler jobs
  │     ├── billing-observability/ # BigQuery datasets, export jobs
  │     └── secrets/               # Secret Manager setup
  │
  └── stacks/
        ├── hosted-multi-tenant/   # Shared infrastructure composition
        └── customer-dedicated/    # Per-customer project composition
```

---

## 9. Security and Compliance

### 9.1 Infrastructure Baseline

| Control | Implementation |
|---------|---------------|
| Compute region | `europe-west2` (Functions v2 and Cloud Run) |
| Secrets | Google Secret Manager (no env vars for credentials) |
| Client credential exposure | Ephemeral session tokens only; no long-lived provider keys to browser |
| Bridge ↔ control plane auth | Signed shared secret, upgraded to rotated JWT in Phase 2 |
| Public ingress | WAF/rate limits via Cloud Armor or equivalent |
| Encryption at rest | GCP default (AES-256) |
| Encryption in transit | TLS 1.2+ enforced on all endpoints |

### 9.2 Tenant Safety Controls

| Control | Scope | Purpose |
|---------|-------|---------|
| Usage quota | Per app, per environment | Prevent runaway costs |
| Provider spending cap | Per provider config | Limit exposure to a single provider |
| Call concurrency cap | Per environment | Prevent resource exhaustion |
| Session duration limit | Per workflow or global | Prevent stuck sessions |
| API rate limiting | Per API key | Prevent abuse |
| Emergency kill switch | Per environment | Immediate suspension of all sessions |

### 9.3 Auditability

| Event | Logged |
|-------|--------|
| Billing events | Immutable, append-only ledger |
| Deployment/promotion | Actor, timestamp, version, environment |
| Workflow version changes | Full version history with author |
| Provider credential changes | Rotation events, actor, timestamp |
| Number provisioning actions | Full lifecycle audit trail |
| Connector invocations | Args (redacted), result, duration, status |
| Member management | Invite, role change, removal |

### 9.4 Telephony Regulatory Controls

- Auditable record of compliance bundle submissions and approvals
- Jurisdiction restrictions enforced at provisioning and assignment time
- Alert pipeline for approaching compliance artifact expiry or provider suspension
- PII/document storage separated from runtime call data with strict access policies
- No call recording by default; opt-in with explicit consent controls per jurisdiction

### 9.5 SOC 2 Readiness Baseline

Target controls from day one:
- Access control (RBAC, API key scoping, least-privilege IAM)
- Change management (workflow versioning, deployment promotion, audit trails)
- Data integrity (immutable billing, append-only usage events)
- System availability (SLOs, health checks, incident tracking)
- Confidentiality (Secret Manager, encryption, tenant isolation)

---

## 10. Observability and SLOs

### 10.1 Golden Signals

| Signal | Measurement |
|--------|------------|
| Session start success rate | `successful session.create / total session.create attempts` |
| Time to first assistant audio | `timestamp(first_audio_event) - timestamp(session.connect)` |
| Turn completion latency | `timestamp(turn_complete) - timestamp(user_speech_end)` |
| Call connect success rate | `successful call connects / total outbound call attempts` |
| Call drop/failure rate | `failed or dropped calls / total calls` |
| Extraction completion rate | `sessions with extraction score > threshold / total extraction sessions` |
| Webhook delivery success rate | `successful deliveries / total webhook dispatches` |

### 10.2 SLO Targets

| SLO | Target | Measurement Window |
|-----|--------|-------------------|
| Session start success | >= 99.5% | Rolling 7-day |
| Call connect success | >= 98% | Rolling 7-day |
| Call-to-finalize success | >= 95% | Rolling 7-day |
| Platform overhead per turn | p95 <= 250ms (excluding model latency) | Rolling 24-hour |
| Webhook delivery success | >= 99.9% (with retries) | Rolling 7-day |
| Dashboard availability | >= 99.5% | Rolling 30-day |
| API availability | >= 99.9% | Rolling 30-day |

### 10.3 Telemetry Stack

**Structured logging:**
- Every log entry includes correlation IDs: `orgId`, `appId`, `envId`, `sessionId`, `callSid`
- JSON structured format for machine parsing
- Log levels: `debug`, `info`, `warn`, `error`

**Distributed tracing:**
- Traces across Functions v2 → Cloud Run → voice provider WebSocket → Pub/Sub
- Per-turn trace spans for latency attribution (platform overhead vs provider latency vs tool call latency)

**Metrics dashboards:**

| Dashboard | Audience | Metrics |
|-----------|----------|---------|
| Global platform health | Platform ops team | All golden signals, error rates, provider status |
| Per-tenant dashboard | Customer (via console) | Session volume, usage, cost, latency, error rates |
| Provider performance | Platform ops + customers | Per-provider latency percentiles, error rates, availability |
| Billing reconciliation | Platform finance | Usage event counts, estimated vs final amounts, Stripe sync status |

### 10.4 Alerting

| Alert | Trigger | Action |
|-------|---------|--------|
| Session start failure spike | > 5% failure rate over 5 minutes | Page on-call + investigate provider status |
| Call connect failure spike | > 10% failure rate over 10 minutes | Page on-call + check Twilio status |
| Provider error rate | > 2% for any single provider over 5 minutes | Warning alert + check provider dashboard |
| Billing event write failure | Any write failure | Critical alert (data integrity risk) |
| Webhook delivery failure rate | > 5% over 15 minutes | Warning alert + check customer endpoints |
| Tenant quota approach | > 80% of usage quota | Notify customer via email/dashboard |

---

## 11. Visual Flow Designer — Technical Requirements

### 11.1 Architecture

The visual designer is a frontend application (part of the developer console dashboard) that produces and consumes the same JSON workflow format used by the SDK.

```
Visual Designer Canvas (React)
  ├── Block library (drag-and-drop)
  ├── Edge connections (flow logic)
  ├── Block configuration panels
  └── Compile to WorkflowDefinition JSON
        ↓
  Workflow Service API
  ├── Validate schema
  ├── Store version
  └── Deploy to environment
```

### 11.2 Block Types → Workflow Stages

| Block | Compiles To | Configuration Surface |
|-------|------------|----------------------|
| Start | `greeting` stage | Trigger type, greeting prompt, persona |
| Conversation | `conversation` stage | System prompt, tools, max turns |
| Extraction | `extraction` stage | Extraction schema designer, completion threshold |
| Condition | `condition` stage | Expression builder (field, operator, value) |
| Action | `action` stage | Webhook URL, method, payload mapper, error handling |
| Memory | `memory_read` / `memory_write` stage | Scope, keys, inject-into-prompt toggle |
| Prompt | `conversation` stage (with explicit prompt) | System prompt editor, model/temperature |
| Handoff | `handoff` stage | Transfer target, context payload |
| End | `end` stage | Farewell prompt, summary toggle, post-call webhook |

### 11.3 Storage

- Flow canvas state (block positions, connections) stored alongside the workflow definition
- Canvas state is metadata — the workflow definition is the canonical runtime artifact
- Version history with restore capability
- Auto-save with conflict detection for multi-user editing (Team+ plans)

### 11.4 Extraction Schema Designer

Visual interface for defining extraction outcomes without writing JSON:

- Add/remove outcome fields
- Select type (string, number, boolean, enum, array, object)
- Write natural language descriptions
- Mark required/optional
- Set completion threshold via slider
- Preview compiled JSON

---

## 12. Delivery Roadmap (Technical Phasing)

Aligned with the PRD v2 90-day execution plan, with technical detail.

### Phase 0 — Architecture Freeze (Week 1-2)

- Lock: VoiceConnection interface, NormalizedVoiceEvent schema, WorkflowDefinition JSON format
- Lock: tenant hierarchy (org/app/env), API key model, RBAC roles
- Lock: Firestore collection paths (section 4)
- Lock: webhook event types and payload format
- Decision: hosted-only for launch (dedicated deferred to Phase 2 — confirmed in PRD v2)
- Fork repository from Flank, set up monorepo structure

### Phase 1 — Core Runtime (Week 3-6)

- Extract connection layer as standalone package (provider adapters, event normalisation)
- Build session API (`POST /v1/sessions`, `GET`, finalize)
- Build OpenAI adapter (fully tested), Gemini adapter (with stall recovery), ElevenLabs adapter
- Port telephony bridge to use shared adapter interface
- Implement workflow interpreter (stages: greeting, conversation, end)
- Ship JavaScript SDK v0.1 (sessions, connect, events, tools)
- Ship `@voicerails/react` v0.1 (useVoiceSession hook)

### Phase 2 — Control Plane + Visual Designer (Week 5-10)

- Build tenant service (org/app/env CRUD, member management)
- Build auth service (Google/GitHub SSO, API key issuance)
- Build provider config service (credential storage, validation)
- Ship developer console dashboard (app management, provider config, session logs)
- Ship visual flow designer MVP (Start, Conversation, Extraction, Condition, Action, End blocks)
- Build extraction engine (real-time tracking, post-session extraction, extraction schemas)
- Build Python SDK v0.1
- Ship CLI v0.1 (`login`, `init`, `apps`, `providers`, `workflows`)

### Phase 3 — Telephony + Billing (Week 8-12)

- Build telephony service (Twilio adapter: number search, provision, assign, release)
- Build compliance bundle management
- Ship telephony numbers UI in developer console
- Build billing service (event ingestion, BigQuery export, Stripe sync)
- Ship usage dashboard in developer console
- Build webhook delivery system (event dispatch, signature, retries)
- Ship outbound calls API and scheduled calls

### Phase 4 — Memory + Connectors + Hardening (Week 11-14)

- Build memory engine (per-user, per-session, cross-session, app-level)
- Build connector runtime (webhook connectors, credential management, audit logs)
- Add Memory, Prompt, Handoff blocks to visual designer
- Ship sandbox/test environment support
- Reliability testing under load
- Incident playbooks and SLO instrumentation

---

## 13. Definition of Done — Platform v1

Platform v1 is complete when:

1. A **developer** can sign up (Google/GitHub SSO), create an app, add provider credentials, and run an in-app voice session using the JavaScript SDK — all within 30 minutes
2. A **non-technical builder** can sign up, open the visual designer, build a conversation flow with extraction, and test it — within 15 minutes
3. A developer can trigger an **outbound phone call** using a provisioned number and the same workflow used for in-app voice
4. Tool calls during a session can be handled **client-side** (SDK event) or **server-side** (webhook)
5. Post-session **extraction results** are available via API and webhook
6. **Session logs**, provider latency, and **usage/cost breakdown** are visible in the developer console
7. Provider credentials can be **rotated** and workflow versions **promoted** without downtime
8. Phone numbers can be **searched, provisioned, and assigned** by jurisdiction from the platform UI/API (for supported regions)
9. **Billing** works end-to-end: platform fee + seat charges + usage overages + transparent pass-through with markup
10. A builder can **host** a voice experience on the platform without managing any infrastructure

---

## 14. Document Relationships

```
┌────────────────────────────────┐
│  voice-infrastructure-prd-v2   │  Product: what, why, for whom, pricing
└───────────────┬────────────────┘
                │
    ┌───────────┼───────────────────┐
    │           │                   │
    ▼           ▼                   ▼
┌─────────┐ ┌───────────────┐ ┌──────────────────┐
│ THIS    │ │ implementation│ │ sdk-developer-    │
│ DOC     │ │ guide         │ │ experience-spec   │
│         │ │               │ │                   │
│ Platform│ │ Connection    │ │ SDK API, workflow  │
│ eng:    │ │ layer, adapters│ │ format, webhooks, │
│ tenancy,│ │ VAD, audio,   │ │ CLI, project      │
│ data,   │ │ echo, tools   │ │ structure         │
│ security│ │               │ │                   │
│ billing │ └───────┬───────┘ └──────────────────┘
│ observ. │         │
│ infra   │         ▼
└─────────┘ ┌───────────────┐
            │ implementation│  Raw Flank learnings
            │ learnings     │  (appendix)
            └───────────────┘
```

---

*End of document.*
