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
  streamSid: string;
  startedAtMs: number;
  transcript: Array<{role: "user" | "assistant"; text: string; timestamp: string}>;
  toolEvents: Array<{callId: string; name: string; args: Record<string, unknown>; timestamp: string}>;
  errors: Array<{message: string; code?: string; timestamp: string}>;
}

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

  socket.on("message", async (raw) => {
    const frame = JSON.parse(String(raw)) as TwilioFrame;
    if (frame.event === "start") {
      const streamSid = frame.streamSid ?? "";
      const config = await fetchBridgeSessionConfig({
        provider: frame.start?.customParameters?.provider,
        workflowId: frame.start?.customParameters?.workflowId,
        endUserId: frame.start?.customParameters?.userId,
      });
      runtime = {
        sessionId: config.id,
        streamSid,
        startedAtMs: Date.now(),
        transcript: [],
        toolEvents: [],
        errors: [],
      };
      providerConnection = await createBridgeConnection(config);
      providerConnection.on("assistant_audio", (event) => {
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
      providerConnection.on("user_transcript", (event) => {
        runtime?.transcript.push({
          role: "user",
          text: event.text,
          timestamp: new Date().toISOString(),
        });
      });
      providerConnection.on("assistant_transcript", (event) => {
        runtime?.transcript.push({
          role: "assistant",
          text: event.text,
          timestamp: new Date().toISOString(),
        });
      });
      providerConnection.on("tool_call", (event) => {
        runtime?.toolEvents.push({
          callId: event.callId,
          name: event.name,
          args: event.args,
          timestamp: new Date().toISOString(),
        });
      });
      providerConnection.on("error", (event) => {
        runtime?.errors.push({
          code: event.code,
          message: event.message,
          timestamp: new Date().toISOString(),
        });
      });
      return;
    }

    if (frame.event === "media" && frame.media?.payload && providerConnection) {
      providerConnection.sendAudio(frame.media.payload);
      return;
    }

    if (frame.event === "stop") {
      providerConnection?.disconnect();
      if (runtime) {
        await finalizeBridgeSession({
          sessionId: runtime.sessionId,
          metadata: {
            channel: "telephony",
            streamSid: runtime.streamSid,
            durationMs: Date.now() - runtime.startedAtMs,
            transcript: runtime.transcript,
            toolEvents: runtime.toolEvents,
            errors: runtime.errors,
          },
        }).catch((error) => {
          // eslint-disable-next-line no-console
          console.error("Failed to finalize bridge session:", error);
        });
      }
      providerConnection = null;
      runtime = null;
    }
  });

  socket.on("close", async () => {
    providerConnection?.disconnect();
    if (runtime) {
      await finalizeBridgeSession({
        sessionId: runtime.sessionId,
        metadata: {
          channel: "telephony",
          streamSid: runtime.streamSid,
          durationMs: Date.now() - runtime.startedAtMs,
          transcript: runtime.transcript,
          toolEvents: runtime.toolEvents,
          errors: runtime.errors,
          closedBy: "socket_close",
        },
      }).catch(() => {
        // best effort
      });
    }
    runtime = null;
  });
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
