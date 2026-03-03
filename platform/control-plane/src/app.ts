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
import {ProviderTokenError, createProviderSessionToken} from "./services/providerTokens.js";
import {appendBillingEvent, syncUsageToStripe} from "./services/billing.js";
import {provisionNumber, searchNumbers} from "./services/telephony.js";
import {getSecretValue} from "./services/secretManager.js";
import {WorkflowInterpreter, type WorkflowDefinition} from "./services/workflowEngine.js";
import {dispatchWebhookEvent} from "./services/webhookDispatcher.js";
import {runPostSessionExtraction} from "./services/extractionEngine.js";
import {estimateSessionCosts} from "./services/costing.js";

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

const extractionSchemaSchema = z.object({
  name: z.string().min(1),
  outcomes: z.array(
    z.object({
      field: z.string().min(1),
      required: z.boolean().optional(),
      type: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
  completionThreshold: z.number().min(0).max(1).optional(),
  conversationStyle: z.string().optional(),
});

const connectorSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["webhook", "database", "queue"]),
  endpoint: z.string().url(),
  authType: z.enum(["api_key", "oauth2", "basic", "service_account"]).default("api_key"),
  credentialSecretRef: z.string().optional(),
  egressPolicy: z
    .object({
      allowedHosts: z.array(z.string()).optional(),
      tlsRequired: z.boolean().optional(),
      staticIp: z.boolean().optional(),
    })
    .optional(),
  retryPolicy: z
    .object({
      maxRetries: z.number().min(0).max(10).optional(),
      backoffMs: z.number().min(100).max(60_000).optional(),
      backoffMultiplier: z.number().min(1).max(10).optional(),
    })
    .optional(),
  circuitBreaker: z
    .object({
      failureThreshold: z.number().min(1).max(50).optional(),
      resetTimeoutMs: z.number().min(1000).max(3_600_000).optional(),
    })
    .optional(),
  allowedWorkflows: z.array(z.string()).optional(),
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
  const provider = String(req.params.provider);
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
  const session = await repo.getSession(req.tenant!, String(req.params.sessionId));
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
  let providerToken: Awaited<ReturnType<typeof createProviderSessionToken>>;
  try {
    providerToken = await createProviderSessionToken({
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
  } catch (error) {
    if (error instanceof ProviderTokenError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          status: error.status,
        },
      });
      return;
    }
    res.status(502).json({
      error: {
        code: "provider_session_failed",
        message: (error as Error).message,
        status: 502,
      },
    });
    return;
  }

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

  await emitWebhook(req, "session.started", {
    sessionId: session.id,
    provider: session.provider,
    channel: session.channel,
    endUserId: session.endUserId ?? null,
    metadata: session.metadata,
  });

  res.status(201).json(session);
});

app.post("/v1/sessions/:sessionId/finalize", async (req, res) => {
  const session = await repo.getSession(req.tenant!, String(req.params.sessionId));
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
  const durationMs = Math.max(0, new Date(endedAt).valueOf() - new Date(session.startedAt).valueOf());
  const costs = estimateSessionCosts({
    provider: session.provider,
    durationMs,
  });
  await repo.updateSession(req.tenant!, session.id, {
    status: "completed",
    endedAt,
  });

  const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript : [];
  let extractionSchema: Record<string, unknown> | undefined;
  if (req.body?.extractionSchemaId) {
    const schemaSnapshot = await db
      .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/extractionSchemas`)
      .doc(String(req.body.extractionSchemaId))
      .get();
    extractionSchema = schemaSnapshot.exists ? (schemaSnapshot.data() as Record<string, unknown>) : undefined;
  }
  const extractionResult = runPostSessionExtraction({
    transcript,
    schema: extractionSchema as any,
  });
  await repo
    .sessionsCollection(req.tenant!)
    .doc(session.id)
    .collection("extractions")
    .doc(`ex_${Date.now()}`)
    .set({
      schemaId: req.body?.extractionSchemaId ?? null,
      completionScore: extractionResult.completionScore,
      fields: extractionResult.fields,
      timestamp: endedAt,
    });

  await appendBillingEvent({
    event_id: randomUUID(),
    tenant_id: req.tenant!.orgId,
    project_id: req.tenant!.appId,
    event_type: "voice_minute",
    provider: session.provider,
    duration_ms: durationMs,
    tokens_in: 0,
    tokens_out: 0,
    provider_cost_usd: costs.providerCostUsd,
    platform_fee_usd: costs.platformFeeUsd,
    timestamp: endedAt,
    metadata: req.body ?? {},
  });

  await db.collection("billingEvents").doc(randomUUID()).set({
    orgId: req.tenant!.orgId,
    appId: req.tenant!.appId,
    envId: req.tenant!.envId,
    eventType: "voice_minute",
    provider: session.provider,
    durationMs,
    providerCostUsd: costs.providerCostUsd,
    platformFeeUsd: costs.platformFeeUsd,
    timestamp: endedAt,
    sessionId: session.id,
  });

  await emitWebhook(req, "session.completed", {
    sessionId: session.id,
    durationSeconds: Math.round(durationMs / 1000),
    transcript,
    extraction: extractionResult,
  });

  await emitWebhook(req, "session.extraction_complete", {
    sessionId: session.id,
    extraction: extractionResult,
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
  await emitWebhook(req, "call.initiated", {
    callId: call.id,
    sessionId: call.sessionId,
    to: call.to,
    from: call.from,
  });
  res.status(201).json(call);
});

app.get("/v1/calls/:callId", async (req, res) => {
  const call = await repo.getCall(req.tenant!, String(req.params.callId));
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
  const workflow = await repo.getWorkflow(req.tenant!, String(req.params.workflowId));
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
  await repo.updateWorkflow(req.tenant!, String(req.params.workflowId), {
    name: parsed.data.name,
    definition: parsed.data.definition,
    currentVersionId: `v_${Date.now()}`,
  });
  res.json(await repo.getWorkflow(req.tenant!, String(req.params.workflowId)));
});

app.post("/v1/workflows/:workflowId/deploy", requireRole("developer"), async (req, res) => {
  const env = String(req.body?.environment ?? req.tenant!.envId);
  await repo.updateWorkflow(req.tenant!, String(req.params.workflowId), {
    deployedVersions: {[env]: req.body?.version ?? `v_${Date.now()}`},
  });
  res.json({ok: true});
});

app.post("/v1/workflows/:workflowId/execute", requireRole("developer"), async (req, res) => {
  const workflow = await repo.getWorkflow(req.tenant!, String(req.params.workflowId));
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

app.post("/v1/connectors", requireRole("admin"), async (req, res) => {
  const parsed = connectorSchema.safeParse(req.body);
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
  const id = `conn_${randomUUID()}`;
  await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/connectors`)
    .doc(id)
    .set({
      id,
      ...parsed.data,
      status: "active",
      failureCount: 0,
      circuitOpenUntil: null,
      createdAt: new Date().toISOString(),
    });
  res.status(201).json({id, ...parsed.data, status: "active"});
});

app.get("/v1/connectors", async (req, res) => {
  const snapshot = await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/connectors`)
    .get();
  res.json(snapshot.docs.map((doc) => doc.data()));
});

app.post("/v1/connectors/:id/invoke", requireRole("developer"), async (req, res) => {
  const connectorRef = db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/connectors`)
    .doc(String(req.params.id));
  const connectorSnapshot = await connectorRef.get();
  if (!connectorSnapshot.exists) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Connector not found",
        status: 404,
      },
    });
    return;
  }

  const connector = connectorSnapshot.data() as Record<string, any>;
  const nowMs = Date.now();
  const circuitOpenUntil = Number(connector.circuitOpenUntil ?? 0);
  if (circuitOpenUntil > nowMs) {
    res.status(429).json({
      error: {
        code: "circuit_open",
        message: "Connector circuit breaker is open",
        status: 429,
      },
    });
    return;
  }

  const retryPolicy = connector.retryPolicy ?? {};
  const maxRetries = Number(retryPolicy.maxRetries ?? 2);
  const backoffMs = Number(retryPolicy.backoffMs ?? 500);
  const backoffMultiplier = Number(retryPolicy.backoffMultiplier ?? 2);

  let responseBody: unknown = null;
  let responseStatus = 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(String(connector.endpoint), {
        method: String(req.body?.method ?? "POST").toUpperCase(),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body?.payload ?? {}),
      });
      responseStatus = response.status;
      responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Connector responded ${response.status}`);
      }
      await connectorRef.set(
        {
          failureCount: 0,
          lastInvocationAt: new Date().toISOString(),
          lastStatus: "success",
        },
        {merge: true},
      );
      res.json({
        ok: true,
        status: responseStatus,
        response: responseBody,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = backoffMs * Math.pow(backoffMultiplier, attempt);
        await sleep(delay);
      }
    }
  }

  const nextFailureCount = Number(connector.failureCount ?? 0) + 1;
  const failureThreshold = Number(connector.circuitBreaker?.failureThreshold ?? 5);
  const resetTimeoutMs = Number(connector.circuitBreaker?.resetTimeoutMs ?? 30000);
  const shouldOpenCircuit = nextFailureCount >= failureThreshold;
  await connectorRef.set(
    {
      failureCount: nextFailureCount,
      circuitOpenUntil: shouldOpenCircuit ? Date.now() + resetTimeoutMs : null,
      lastInvocationAt: new Date().toISOString(),
      lastStatus: "error",
      lastError: String(lastError ?? "unknown"),
    },
    {merge: true},
  );

  res.status(502).json({
    error: {
      code: "connector_invoke_failed",
      message: String(lastError ?? "Connector invocation failed"),
      status: 502,
      responseStatus,
      responseBody,
    },
  });
});

app.post("/v1/extraction/schemas", requireRole("developer"), async (req, res) => {
  const parsed = extractionSchemaSchema.safeParse(req.body);
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
  const id = `schema_${randomUUID()}`;
  await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/extractionSchemas`)
    .doc(id)
    .set({
      id,
      ...parsed.data,
      createdAt: new Date().toISOString(),
    });
  res.status(201).json({id, ...parsed.data});
});

app.get("/v1/extraction/schemas", async (req, res) => {
  const snapshot = await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/extractionSchemas`)
    .get();
  res.json(snapshot.docs.map((doc) => doc.data()));
});

app.get("/v1/extraction/schemas/:id", async (req, res) => {
  const snapshot = await db
    .collection(`orgs/${req.tenant!.orgId}/apps/${req.tenant!.appId}/extractionSchemas`)
    .doc(String(req.params.id))
    .get();
  if (!snapshot.exists) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Extraction schema not found",
        status: 404,
      },
    });
    return;
  }
  res.json(snapshot.data());
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
  await repo.numbersCollection(req.tenant!).doc(String(req.params.numberId)).set(
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
  await repo.numbersCollection(req.tenant!).doc(String(req.params.numberId)).set(
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
  await repo.webhooksCollection(req.tenant!).doc(String(req.params.id)).delete();
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
  const billingSnapshot = await db
    .collection("billingEvents")
    .where("orgId", "==", req.tenant!.orgId)
    .where("appId", "==", req.tenant!.appId)
    .get();
  const billingEvents = billingSnapshot.docs.map((doc) => doc.data());
  const providerUsd = billingEvents.reduce((sum, event) => sum + Number(event.providerCostUsd ?? 0), 0);
  const platformUsd = billingEvents.reduce((sum, event) => sum + Number(event.platformFeeUsd ?? 0), 0);
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
      platformUsd,
      providerUsd,
      telephonyUsd: 0,
    },
  });
});

app.get("/v1/analytics/slo", async (req, res) => {
  const sessions = await repo.listSessions(req.tenant!);
  const calls = await repo.listCalls(req.tenant!);

  const durationsMs = sessions
    .filter((session) => Boolean(session.endedAt))
    .map((session) => Math.max(0, new Date(session.endedAt!).valueOf() - new Date(session.startedAt).valueOf()))
    .sort((a, b) => a - b);
  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const failedSessions = sessions.filter((session) => session.status === "failed").length;
  const totalTerminalSessions = completedSessions + failedSessions;
  const sessionSuccessRate = totalTerminalSessions > 0 ? completedSessions / totalTerminalSessions : 1;
  const p95DurationMs = percentile(durationsMs, 0.95);

  const successfulCalls = calls.filter((call) => call.status === "completed" || call.status === "ringing").length;
  const callSuccessRate = calls.length > 0 ? successfulCalls / calls.length : 1;

  res.json({
    slo: {
      sessionSuccessRate,
      callSuccessRate,
      p95SessionDurationMs: p95DurationMs,
      sampleSizes: {
        sessions: sessions.length,
        calls: calls.length,
      },
    },
    targets: {
      sessionSuccessRate: 0.999,
      callSuccessRate: 0.99,
      p95SessionDurationMs: 180000,
    },
  });
});

app.get("/v1/analytics/providers", async (req, res) => {
  const billingSnapshot = await db
    .collection("billingEvents")
    .where("orgId", "==", req.tenant!.orgId)
    .where("appId", "==", req.tenant!.appId)
    .get();
  const grouped = billingSnapshot.docs.reduce<Record<string, {events: number; providerUsd: number}>>((acc, doc) => {
    const data = doc.data();
    const provider = String(data.provider ?? "unknown");
    if (!acc[provider]) {
      acc[provider] = {events: 0, providerUsd: 0};
    }
    acc[provider].events += 1;
    acc[provider].providerUsd += Number(data.providerCostUsd ?? 0);
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

async function emitWebhook(
  req: express.Request,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const snapshot = await repo.webhooksCollection(req.tenant!).get();
  const webhooks = snapshot.docs.map((doc) => {
    const payload = doc.data();
    return {
      id: payload.id,
      url: payload.url,
      secret: payload.secret,
      events: payload.events ?? [],
    };
  });
  await dispatchWebhookEvent(webhooks, {
    id: `evt_${randomUUID()}`,
    type,
    createdAt: new Date().toISOString(),
    appId: req.tenant!.appId,
    environment: req.tenant!.envId,
    data,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values: number[], p: number): number {
  if (!values.length) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(1, p));
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * clamped) - 1));
  return values[index];
}
