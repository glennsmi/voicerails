import React from "react";
import type {TranscriptEntry} from "./useVoiceSession.js";

export function VoiceOrb({
  status,
  isAssistantSpeaking,
}: {
  status: "idle" | "connecting" | "ready" | "error";
  isAssistantSpeaking: boolean;
}) {
  const color = status === "error" ? "#ff4d4f" : isAssistantSpeaking ? "#7c3aed" : "#2563eb";
  return (
    <div
      style={{
        width: 80,
        height: 80,
        borderRadius: "50%",
        background: color,
        opacity: status === "connecting" ? 0.7 : 1,
        transition: "all 0.2s ease",
      }}
    />
  );
}

export function TranscriptView({transcript}: {transcript: TranscriptEntry[]}) {
  return (
    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
      {transcript.map((entry) => (
        <div key={entry.streamKey} style={{padding: 8, borderRadius: 8, background: "#f3f4f6"}}>
          <strong>{entry.role}</strong>: {entry.text} {entry.isStreaming ? "..." : ""}
        </div>
      ))}
    </div>
  );
}

export function VoiceControls({
  isMuted,
  onToggleMute,
  onEnd,
}: {
  isMuted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  return (
    <div style={{display: "flex", gap: 8}}>
      <button type="button" onClick={onToggleMute}>
        {isMuted ? "Unmute" : "Mute"}
      </button>
      <button type="button" onClick={onEnd}>
        End
      </button>
    </div>
  );
}
