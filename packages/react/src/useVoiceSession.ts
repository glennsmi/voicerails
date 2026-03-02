import {useMemo, useRef, useState} from "react";
import {VoiceRails} from "@voicerails/sdk";
import type {SessionCreateInput} from "@voicerails/sdk";

export interface TranscriptEntry {
  streamKey: string;
  role: "user" | "assistant";
  text: string;
  isStreaming: boolean;
}

export interface UseVoiceSessionOptions extends SessionCreateInput {
  apiKey: string;
}

export function useVoiceSession(options: UseVoiceSessionOptions) {
  const client = useMemo(() => new VoiceRails({apiKey: options.apiKey}), [options.apiKey]);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<any>(null);

  async function connect(): Promise<void> {
    try {
      setStatus("connecting");
      const session = await client.sessions.create(options);
      const connection = await session.connect();
      connectionRef.current = connection;
      connection.on("assistant_transcript", (event) => {
        upsertEntry(event.streamKey, "assistant", event.text, !event.isFinal);
      });
      connection.on("user_transcript", (event) => {
        upsertEntry(event.streamKey, "user", event.text, !event.isFinal);
      });
      connection.on("error", (event) => {
        setError(event.message);
        setStatus("error");
      });
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  async function disconnect(): Promise<void> {
    await connectionRef.current?.disconnect?.();
    connectionRef.current = null;
    setStatus("idle");
  }

  function sendText(text: string): void {
    connectionRef.current?.sendText?.(text);
  }

  function toggleMute(): void {
    setIsMuted((previous) => !previous);
  }

  function upsertEntry(
    streamKey: string,
    role: "user" | "assistant",
    text: string,
    isStreaming: boolean,
  ): void {
    setTranscript((current) => {
      const index = current.findIndex((entry) => entry.streamKey === streamKey);
      if (index === -1) {
        return [...current, {streamKey, role, text, isStreaming}];
      }
      const next = [...current];
      next[index] = {...next[index], text, isStreaming};
      return next;
    });
  }

  return {
    status,
    transcript,
    isMuted,
    error,
    connect,
    disconnect,
    sendText,
    toggleMute,
  };
}
