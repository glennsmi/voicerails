import express from "express";
import {createServer} from "node:http";
import {WebSocketServer} from "ws";
import {createBridgeConnection, fetchBridgeSessionConfig} from "./bridgeApi.js";

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

const app = express();
app.get("/health", (_req, res) => {
  res.json({ok: true, service: "voicerails-telephony-bridge"});
});

const server = createServer(app);
const wss = new WebSocketServer({server, path: "/media-stream"});

wss.on("connection", (socket) => {
  let streamSid = "";
  let providerConnection: Awaited<ReturnType<typeof createBridgeConnection>> | null = null;

  socket.on("message", async (raw) => {
    const frame = JSON.parse(String(raw)) as TwilioFrame;
    if (frame.event === "start") {
      streamSid = frame.streamSid ?? "";
      const config = await fetchBridgeSessionConfig({
        provider: frame.start?.customParameters?.provider,
        workflowId: frame.start?.customParameters?.workflowId,
        endUserId: frame.start?.customParameters?.userId,
      });
      providerConnection = await createBridgeConnection(config);
      providerConnection.on("assistant_audio", (event) => {
        socket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: {
              payload: event.audioBase64,
            },
          }),
        );
      });
      return;
    }

    if (frame.event === "media" && frame.media?.payload && providerConnection) {
      providerConnection.sendAudio(frame.media.payload);
      return;
    }

    if (frame.event === "stop") {
      providerConnection?.disconnect();
      providerConnection = null;
    }
  });

  socket.on("close", () => {
    providerConnection?.disconnect();
  });
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`VoiceRails telephony bridge listening on :${port}`);
});
