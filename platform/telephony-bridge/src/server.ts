import express from "express";
import {createServer} from "node:http";
import {WebSocketServer} from "ws";
import {
  type BridgeConnection,
  createBridgeConnection,
  fetchBridgeSessionConfig,
  finalizeBridgeSession,
} from "./bridgeApi.js";

interface TwilioFrame {
  event: "connected" | "start" | "media" | "stop";
  streamSid?: string;
  media?: {
    payload: string;
  };
  start?: {
    customParameters?: Record<string, string>;
  };
}

interface BridgeSessionRuntime {
  sessionId: string;
  sessionIds: string[];
  currentProvider: string;
  reconnectAttempts: number;
  failoverCount: number;
  startParameters: {
    provider?: string;
    workflowId?: string;
    endUserId?: string;
  };
  streamSid: string;
  startedAtMs: number;
  transcript: Array<{role: "user" | "assistant"; text: string; timestamp: string}>;
  toolEvents: Array<{callId: string; name: string; args: Record<string, unknown>; timestamp: string}>;
  errors: Array<{message: string; code?: string; timestamp: string}>;
}

const BRIDGE_MAX_RECONNECT_ATTEMPTS = Number(process.env.BRIDGE_MAX_RECONNECT_ATTEMPTS ?? 2);
const BRIDGE_RECONNECT_BACKOFF_MS = Number(process.env.BRIDGE_RECONNECT_BACKOFF_MS ?? 750);
const BRIDGE_FALLBACK_PROVIDER = (process.env.BRIDGE_FALLBACK_PROVIDER ?? "").trim();

const app = express();
app.get("/health", (_req, res) => {
  res.json({ok: true, service: "voicerails-telephony-bridge"});
});

app.post("/twiml/inbound", express.urlencoded({extended: false}), (req, res) => {
  const publicBridgeUrl = process.env.PUBLIC_BRIDGE_URL ?? "";
  const userId = req.body?.From ?? "unknown";
  const streamUrl = publicBridgeUrl
    ? `${publicBridgeUrl.replace(/^http/, "ws")}/media-stream`
    : "wss://example-bridge.invalid/media-stream";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="userId" value="${escapeXml(userId)}" />
      <Parameter name="provider" value="openai" />
    </Stream>
  </Connect>
</Response>`;
  res.type("text/xml").send(twiml);
});

const server = createServer(app);
const wss = new WebSocketServer({server, path: "/media-stream"});

wss.on("connection", (socket) => {
  let runtime: BridgeSessionRuntime | null = null;
  let providerConnection: BridgeConnection | null = null;
  let shuttingDown = false;
  let recoveryInProgress = false;

  socket.on("message", async (raw) => {
    const frame = JSON.parse(String(raw)) as TwilioFrame;
    if (frame.event === "start") {
      const streamSid = frame.streamSid ?? "";
      const startParameters = {
        provider: frame.start?.customParameters?.provider,
        workflowId: frame.start?.customParameters?.workflowId,
        endUserId: frame.start?.customParameters?.userId,
      };
      const config = await fetchBridgeSessionConfig(startParameters);
      runtime = {
        sessionId: config.id,
        sessionIds: [config.id],
        currentProvider: config.provider,
        reconnectAttempts: 0,
        failoverCount: 0,
        startParameters,
        streamSid,
        startedAtMs: Date.now(),
        transcript: [],
        toolEvents: [],
        errors: [],
      };

      providerConnection = await createBridgeConnection(config);
      attachProviderListeners(providerConnection, streamSid);
      return;
    }

    if (frame.event === "media" && frame.media?.payload && providerConnection) {
      providerConnection.sendAudio(frame.media.payload);
      return;
    }

    if (frame.event === "stop") {
      shuttingDown = true;
      providerConnection?.disconnect();
      if (runtime) {
        await finalizeSession(runtime.sessionId, "stop");
      }
      providerConnection = null;
      runtime = null;
    }
  });

  socket.on("close", async () => {
    shuttingDown = true;
    providerConnection?.disconnect();
    if (runtime) {
      await finalizeSession(runtime.sessionId, "socket_close");
    }
    runtime = null;
  });

  function attachProviderListeners(connection: BridgeConnection, streamSid: string): void {
    connection.on("assistant_audio", (event) => {
      socket.send(
        JSON.stringify({
          event: "media",
          streamSid: runtime?.streamSid ?? streamSid,
          media: {
            payload: event.audioBase64,
          },
        }),
      );
    });
    connection.on("user_transcript", (event) => {
      runtime?.transcript.push({
        role: "user",
        text: event.text,
        timestamp: new Date().toISOString(),
      });
    });
    connection.on("assistant_transcript", (event) => {
      runtime?.transcript.push({
        role: "assistant",
        text: event.text,
        timestamp: new Date().toISOString(),
      });
    });
    connection.on("tool_call", (event) => {
      runtime?.toolEvents.push({
        callId: event.callId,
        name: event.name,
        args: event.args,
        timestamp: new Date().toISOString(),
      });
      void resolveToolCall(event, connection);
    });
    connection.on("error", (event) => {
      runtime?.errors.push({
        code: event.code,
        message: event.message,
        timestamp: new Date().toISOString(),
      });
    });
    connection.on("disconnected", (event) => {
      if (event.intentional || shuttingDown) {
        return;
      }
      runtime?.errors.push({
        code: "provider_disconnected",
        message: event.reason,
        timestamp: new Date().toISOString(),
      });
      void recoverConnection(event.reason);
    });
  }

  async function resolveToolCall(
    event: {callId: string; name: string; args: Record<string, unknown>},
    connection: BridgeConnection,
  ): Promise<void> {
    const toolRuntimeUrl = (process.env.BRIDGE_TOOL_RUNTIME_URL ?? "").trim();
    if (!toolRuntimeUrl) {
      connection.respondToToolCall(
        event.callId,
        JSON.stringify({
          ok: false,
          error: "bridge_tool_runtime_not_configured",
          name: event.name,
        }),
      );
      return;
    }

    try {
      const authToken = (process.env.BRIDGE_TOOL_RUNTIME_AUTH_TOKEN ?? "").trim();
      const response = await fetch(toolRuntimeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? {Authorization: `Bearer ${authToken}`} : {}),
        },
        body: JSON.stringify({
          callId: event.callId,
          toolName: event.name,
          args: event.args,
          sessionId: runtime?.sessionId ?? null,
          streamSid: runtime?.streamSid ?? null,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(`Tool runtime HTTP ${response.status}`);
      }
      connection.respondToToolCall(event.callId, JSON.stringify(result));
    } catch (error) {
      runtime?.errors.push({
        code: "tool_runtime_error",
        message: String((error as Error).message ?? error),
        timestamp: new Date().toISOString(),
      });
      connection.respondToToolCall(
        event.callId,
        JSON.stringify({
          ok: false,
          error: "bridge_tool_runtime_failed",
          message: (error as Error).message,
        }),
      );
    }
  }

  async function recoverConnection(reason: string): Promise<void> {
    if (recoveryInProgress || shuttingDown || !runtime) {
      return;
    }
    recoveryInProgress = true;
    try {
      const previousSessionId = runtime.sessionId;

      if (runtime.reconnectAttempts < BRIDGE_MAX_RECONNECT_ATTEMPTS) {
        runtime.reconnectAttempts += 1;
        await sleep(BRIDGE_RECONNECT_BACKOFF_MS * runtime.reconnectAttempts);
        const reconnectConfig = await fetchBridgeSessionConfig({
          ...runtime.startParameters,
          provider: runtime.currentProvider,
        });
        await finalizeSession(previousSessionId, "provider_reconnect");
        runtime.sessionId = reconnectConfig.id;
        runtime.sessionIds.push(reconnectConfig.id);
        providerConnection = await createBridgeConnection(reconnectConfig);
        attachProviderListeners(providerConnection, runtime.streamSid);
        return;
      }

      if (BRIDGE_FALLBACK_PROVIDER && runtime.currentProvider !== BRIDGE_FALLBACK_PROVIDER) {
        runtime.failoverCount += 1;
        const fallbackConfig = await fetchBridgeSessionConfig({
          ...runtime.startParameters,
          provider: BRIDGE_FALLBACK_PROVIDER,
        });
        await finalizeSession(previousSessionId, "provider_failover");
        runtime.currentProvider = fallbackConfig.provider;
        runtime.sessionId = fallbackConfig.id;
        runtime.sessionIds.push(fallbackConfig.id);
        providerConnection = await createBridgeConnection(fallbackConfig);
        attachProviderListeners(providerConnection, runtime.streamSid);
        return;
      }

      runtime.errors.push({
        code: "provider_recovery_exhausted",
        message: `No recovery path left after disconnect: ${reason}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      runtime?.errors.push({
        code: "provider_recovery_failed",
        message: String((error as Error).message ?? error),
        timestamp: new Date().toISOString(),
      });
    } finally {
      recoveryInProgress = false;
    }
  }

  async function finalizeSession(sessionId: string, reason: string): Promise<void> {
    if (!runtime) {
      return;
    }
    await finalizeBridgeSession({
      sessionId,
      metadata: {
        channel: "telephony",
        streamSid: runtime.streamSid,
        durationMs: Date.now() - runtime.startedAtMs,
        transcript: runtime.transcript,
        toolEvents: runtime.toolEvents,
        errors: runtime.errors,
        reason,
        provider: runtime.currentProvider,
        sessionIds: runtime.sessionIds,
        reconnectAttempts: runtime.reconnectAttempts,
        failoverCount: runtime.failoverCount,
      },
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to finalize bridge session:", error);
    });
  }
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`VoiceRails telephony bridge listening on :${port}`);
});

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
