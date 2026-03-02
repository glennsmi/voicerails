import cors from "cors";
import express from "express";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {db} from "./firebase.js";
import {OPENAI_DEFAULT_MODEL, OPENAI_DEFAULT_VOICE} from "./config.js";
import {authMiddleware} from "./middleware/auth.js";
import {requestContextMiddleware} from "./middleware/requestContext.js";
import {requireRole} from "./middleware/rbac.js";
import {loggingMiddleware} from "./middleware/logging.js";
import {rateLimitMiddleware} from "./middleware/rateLimit.js";
import {FirestoreRepository} from "./repositories/firestoreRepository.js";
import {createProviderSessionToken} from "./services/providerTokens.js";
import {appendBillingEvent, syncUsageToStripe} from "./services/billing.js";
import {provisionNumber, searchNumbers} from "./services/telephony.js";
import {getSecretValue} from "./services/secretManager.js";
import {WorkflowInterpreter, type WorkflowDefinition} from "@voicerails/workflow-engine";

const repo = new FirestoreRepository(db);

const sessionCreateSchema = z.object({
  provider: z.enum(["openai", "gemini", "elevenlabs", "grok"]).optional().default("openai"),
  voice: z.string().optional().default(OPENAI_DEFAULT_VOICE),
  model: z.string().optional().default(OPENAI_DEFAULT_MODEL),
  systemPrompt: z.string().min(1),
  tools: z.array(z.any()).optional().default([]),
  workflowId: z.string().optional(),
  channel: z.enum(["in_app", "telephony"]).optional().default("in_app"),
  metadata: z.record(z.string(), z.string()).optional().default({}),
  endUserId: z.string().optional(),
});

const callCreateSchema = z.object({
  to: z.string().min(5),
  from: z.string().min(5),
  workflowId: z.string().optional(),
  provider: z.enum(["openai", "gemini", "elevenlabs", "grok"]).optional().default("openai"),
  voice: z.string().optional().default(OPENAI_DEFAULT_VOICE),
  systemPrompt: z.string().optional().default("You are a helpful VoiceRails assistant."),
  metadata: z.record(z.string(), z.string()).optional().default({}),
  endUserId: z.string().optional(),
  scheduledAt: z.string().optional(),
});

const workflowSchema = z.object({
  name: z.string().min(1),
  definition: z.record(z.string(), z.unknown()),
});

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  environment: z.string().optional(),
});

const numberSearchSchema = z.object({
  country: z.string().min(2).max(2),
  type: z.enum(["local", "mobile", "toll_free"]).optional(),
  areaCode: z.string().optional(),
});

const numberProvisionSchema = z.object({
  country: z.string().min(2).max(2),
  type: z.enum(["local", "mobile", "toll_free"]),
  specificNumber: z.string().optional(),
});

const providerConfigSchema = z.object({
  provider: z.enum(["openai", "gemini", "elevenlabs", "grok"]),
  apiKeySecretName: z.string().min(1),
});

export const app = express();

app.use(cors());
app.use(express.json({limit: "1mb"}));
app.use(requestContextMiddleware);
app.use(loggingMiddleware);
app.use(rateLimitMiddleware);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "voicerails-control-plane",
    timestamp: new Date().toISOString(),
  });
});

app.use(authMiddleware);

app.get("/v1/providers", async (req, res) => {
  const snapshot = await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/providers`)
    .get();
  res.json(snapshot.docs.map((doc) => doc.data()));
});

app.post("/v1/providers", requireRole("admin"), async (req, res) => {
  const parsed = providerConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  const id = `prov_${randomUUID()}`;
  await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/providers`)
    .doc(id)
    .set({
      id,
      provider: parsed.data.provider,
      credentialSecretRef: parsed.data.apiKeySecretName,
      status: "configured",
      createdAt: new Date().toISOString(),
    });
  res.status(201).json({ok: true, id});
});

app.post("/v1/providers/:provider/test", requireRole("admin"), async (req, res) => {
  const provider = req.params.provider;
  const snapshot = await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/providers`)
    .where("provider", "==", provider)
    .limit(1)
    .get();
  if (snapshot.empty) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Provider config not found",
        status: 404,
      },
    });
    return;
  }
  const data = snapshot.docs[0].data();
  const secret = await getSecretValue(String(data.credentialSecretRef ?? ""));
  res.json({
    ok: Boolean(secret),
    provider,
    configured: true,
    secretResolved: Boolean(secret),
  });
});

app.get("/v1/sessions", async (req, res) => {
  const sessions = await repo.listSessions(req.tenant!);
  res.json(sessions);
});

app.get("/v1/sessions/:sessionId", async (req, res) => {
  const session = await repo.getSession(req.tenant!, req.params.sessionId);
  if (!session) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Session not found",
        status: 404,
      },
    });
    return;
  }
  res.json(session);
});

app.post("/v1/sessions", requireRole("developer"), async (req, res) => {
  const parsed = sessionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  const input = parsed.data;
  const providerToken = await createProviderSessionToken({
    provider: input.provider,
    model: input.model,
    voice: input.voice,
    systemPrompt: input.systemPrompt,
    tools: input.tools,
    audio: {
      inputFormat: input.channel === "telephony" ? "g711_ulaw" : "pcm16",
      outputFormat: input.channel === "telephony" ? "g711_ulaw" : "pcm16",
    },
  });

  const session = await repo.createSession(req.tenant!, {
    status: "active",
    provider: input.provider,
    model: providerToken.model,
    voice: providerToken.voice,
    channel: input.channel,
    workflowId: input.workflowId,
    endUserId: input.endUserId,
    systemPrompt: input.systemPrompt,
    tools: input.tools,
    metadata: input.metadata,
    token: providerToken.token,
    expiresAt: providerToken.expiresAt,
    startedAt: new Date().toISOString(),
  });

  res.status(201).json(session);
});

app.post("/v1/sessions/:sessionId/finalize", async (req, res) => {
  const session = await repo.getSession(req.tenant!, req.params.sessionId);
  if (!session) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Session not found",
        status: 404,
      },
    });
    return;
  }

  const endedAt = new Date().toISOString();
  await repo.updateSession(req.tenant!, session.id, {
    status: "completed",
    endedAt,
  });

  await appendBillingEvent({
    event_id: randomUUID(),
    tenant_id: req.tenant!.orgId,
    project_id: req.tenant!.appId,
    event_type: "voice_minute",
    provider: session.provider,
    duration_ms: Math.max(0, new Date(endedAt).valueOf() - new Date(session.startedAt).valueOf()),
    tokens_in: 0,
    tokens_out: 0,
    provider_cost_usd: 0,
    platform_fee_usd: 0,
    timestamp: endedAt,
    metadata: req.body ?? {},
  });

  res.json({ok: true});
});

app.post("/v1/calls", requireRole("developer"), async (req, res) => {
  const parsed = callCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  const input = parsed.data;
  const session = await repo.createSession(req.tenant!, {
    status: "active",
    provider: input.provider,
    model: OPENAI_DEFAULT_MODEL,
    voice: input.voice,
    channel: "telephony",
    workflowId: input.workflowId,
    endUserId: input.endUserId,
    systemPrompt: input.systemPrompt,
    tools: [],
    metadata: input.metadata,
    token: `bridge_${randomUUID()}`,
    expiresAt: Date.now() + 30 * 60 * 1000,
    startedAt: new Date().toISOString(),
  });

  const call = await repo.createCall(req.tenant!, {
    sessionId: session.id,
    to: input.to,
    from: input.from,
    status: input.scheduledAt ? "queued" : "ringing",
    provider: input.provider,
    startedAt: new Date().toISOString(),
  });
  res.status(201).json(call);
});

app.get("/v1/calls/:callId", async (req, res) => {
  const call = await repo.getCall(req.tenant!, req.params.callId);
  if (!call) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Call not found",
        status: 404,
      },
    });
    return;
  }
  res.json(call);
});

app.get("/v1/calls", async (req, res) => {
  res.json(await repo.listCalls(req.tenant!));
});

app.post("/v1/workflows", requireRole("developer"), async (req, res) => {
  const parsed = workflowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  const created = await repo.createWorkflow(req.tenant!, {
    name: parsed.data.name,
    definition: parsed.data.definition,
    currentVersionId: `v_${Date.now()}`,
    deployedVersions: {},
  });
  res.status(201).json(created);
});

app.get("/v1/workflows", async (req, res) => {
  res.json(await repo.listWorkflows(req.tenant!));
});

app.get("/v1/workflows/:workflowId", async (req, res) => {
  const workflow = await repo.getWorkflow(req.tenant!, req.params.workflowId);
  if (!workflow) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Workflow not found",
        status: 404,
      },
    });
    return;
  }
  res.json(workflow);
});

app.put("/v1/workflows/:workflowId", requireRole("developer"), async (req, res) => {
  const parsed = workflowSchema.partial({name: true}).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  await repo.updateWorkflow(req.tenant!, req.params.workflowId, {
    name: parsed.data.name,
    definition: parsed.data.definition,
    currentVersionId: `v_${Date.now()}`,
  });
  res.json(await repo.getWorkflow(req.tenant!, req.params.workflowId));
});

app.post("/v1/workflows/:workflowId/deploy", requireRole("developer"), async (req, res) => {
  const env = String(req.body?.environment ?? req.tenant!.envId);
  await repo.updateWorkflow(req.tenant!, req.params.workflowId, {
    deployedVersions: {[env]: req.body?.version ?? `v_${Date.now()}`},
  });
  res.json({ok: true});
});

app.post("/v1/workflows/:workflowId/execute", requireRole("developer"), async (req, res) => {
  const workflow = await repo.getWorkflow(req.tenant!, req.params.workflowId);
  if (!workflow) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Workflow not found",
        status: 404,
      },
    });
    return;
  }
  const definition = workflow.definition as unknown as WorkflowDefinition;
  const interpreter = new WorkflowInterpreter(definition);
  const results = await interpreter.run({
    endUserId: String(req.body?.endUserId ?? ""),
    extractions: {},
    memory: {},
    metadata: req.body?.metadata ?? {},
  });
  res.json({ok: true, results});
});

app.post("/v1/telephony/numbers/search", requireRole("developer"), async (req, res) => {
  const parsed = numberSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  res.json(await searchNumbers(parsed.data));
});

app.post("/v1/telephony/numbers/provision", requireRole("admin"), async (req, res) => {
  const parsed = numberProvisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  res.status(201).json(await provisionNumber(repo, req.tenant!, parsed.data));
});

app.get("/v1/telephony/numbers", async (req, res) => {
  const snapshot = await repo.numbersCollection(req.tenant!).get();
  res.json(snapshot.docs.map((doc) => doc.data()));
});

app.post("/v1/telephony/numbers/:numberId/assign", requireRole("admin"), async (req, res) => {
  await repo.numbersCollection(req.tenant!).doc(req.params.numberId).set(
    {
      assignment: {
        envId: req.body?.environment ?? req.tenant!.envId,
        workflowId: req.body?.workflowId ?? null,
      },
    },
    {merge: true},
  );
  res.json({ok: true});
});

app.post("/v1/telephony/numbers/:numberId/release", requireRole("admin"), async (req, res) => {
  await repo.numbersCollection(req.tenant!).doc(req.params.numberId).set(
    {
      lifecycleStatus: "released",
      releasedAt: new Date().toISOString(),
    },
    {merge: true},
  );
  res.json({ok: true});
});

app.post("/v1/webhooks", requireRole("developer"), async (req, res) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_argument",
        message: parsed.error.message,
        status: 400,
      },
    });
    return;
  }
  const id = `wh_${randomUUID()}`;
  const secret = parsed.data.secret ?? `whsec_${randomUUID().replaceAll("-", "")}`;
  await repo.webhooksCollection(req.tenant!).doc(id).set({
    id,
    ...parsed.data,
    secret,
    status: "active",
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({
    id,
    url: parsed.data.url,
    events: parsed.data.events,
    secretPreview: `${secret.slice(0, 8)}...`,
    status: "active",
  });
});

app.get("/v1/webhooks", async (req, res) => {
  const snapshot = await repo.webhooksCollection(req.tenant!).get();
  res.json(
    snapshot.docs.map((doc) => {
      const webhook = doc.data();
      return {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status,
        secretPreview: `${String(webhook.secret ?? "").slice(0, 8)}...`,
      };
    }),
  );
});

app.delete("/v1/webhooks/:id", requireRole("developer"), async (req, res) => {
  await repo.webhooksCollection(req.tenant!).doc(req.params.id).delete();
  res.json({ok: true});
});

app.post("/v1/memory/set", requireRole("developer"), async (req, res) => {
  const key = String(req.body?.key ?? "");
  const scope = String(req.body?.scope ?? "user");
  const endUserId = String(req.body?.endUserId ?? "anonymous");
  if (!key) {
    res.status(400).json({error: {code: "invalid_argument", message: "key is required", status: 400}});
    return;
  }
  const path =
    scope === "app"
      ? `${req.tenant!.orgId}:${req.tenant!.appId}:app:${key}`
      : `${req.tenant!.orgId}:${req.tenant!.appId}:user:${endUserId}:${key}`;
  await db.collection("memory").doc(path).set({
    value: req.body?.value ?? null,
    scope,
    endUserId,
    updatedAt: new Date().toISOString(),
  });
  res.json({ok: true});
});

app.post("/v1/memory/get", async (req, res) => {
  const key = String(req.body?.key ?? "");
  const scope = String(req.body?.scope ?? "user");
  const endUserId = String(req.body?.endUserId ?? "anonymous");
  if (!key) {
    res.status(400).json({error: {code: "invalid_argument", message: "key is required", status: 400}});
    return;
  }
  const path =
    scope === "app"
      ? `${req.tenant!.orgId}:${req.tenant!.appId}:app:${key}`
      : `${req.tenant!.orgId}:${req.tenant!.appId}:user:${endUserId}:${key}`;
  const snapshot = await db.collection("memory").doc(path).get();
  res.json({value: snapshot.exists ? snapshot.data()?.value ?? null : null});
});

app.get("/v1/analytics/usage", async (req, res) => {
  const sessions = await repo.listSessions(req.tenant!);
  const calls = await repo.listCalls(req.tenant!);
  res.json({
    totalSessions: sessions.length,
    totalCalls: calls.length,
    totalMinutes: sessions.reduce((total, session) => {
      if (!session.endedAt) return total;
      return (
        total +
        Math.max(0, new Date(session.endedAt).valueOf() - new Date(session.startedAt).valueOf()) /
          60000
      );
    }, 0),
    totalCost: {
      platformUsd: 0,
      providerUsd: 0,
      telephonyUsd: 0,
    },
  });
});

app.get("/v1/analytics/providers", async (req, res) => {
  const sessions = await repo.listSessions(req.tenant!);
  const grouped = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.provider] = (acc[session.provider] ?? 0) + 1;
    return acc;
  }, {});
  res.json({
    byProvider: grouped,
  });
});

app.post("/v1/billing/events", requireRole("admin"), async (req, res) => {
  await appendBillingEvent({
    event_id: randomUUID(),
    tenant_id: req.tenant!.orgId,
    project_id: req.tenant!.appId,
    event_type: String(req.body?.eventType ?? "api_call"),
    provider: String(req.body?.provider ?? "openai"),
    duration_ms: Number(req.body?.durationMs ?? 0),
    tokens_in: Number(req.body?.tokensIn ?? 0),
    tokens_out: Number(req.body?.tokensOut ?? 0),
    provider_cost_usd: Number(req.body?.providerCostUsd ?? 0),
    platform_fee_usd: Number(req.body?.platformFeeUsd ?? 0),
    timestamp: new Date().toISOString(),
    metadata: req.body?.metadata ?? {},
  });
  res.status(201).json({ok: true});
});

app.post("/v1/billing/sync", requireRole("admin"), async (req, res) => {
  await syncUsageToStripe({
    stripeCustomerId: String(req.body?.stripeCustomerId ?? ""),
    meterEventName: String(req.body?.meterEventName ?? "voicerails.voice.minutes"),
    value: Number(req.body?.value ?? 0),
  });
  res.json({ok: true});
});
