import type {VoiceProvider} from "@voicerails/connection-layer";

export interface TenantContext {
  orgId: string;
  appId: string;
  envId: string;
  role: "owner" | "admin" | "developer" | "builder" | "viewer";
}

export interface SessionDocument {
  id: string;
  status: "active" | "extracting" | "completed" | "failed";
  provider: VoiceProvider;
  model: string;
  voice: string;
  channel: "in_app" | "telephony";
  workflowId?: string;
  workflowVersionId?: string;
  endUserId?: string;
  systemPrompt: string;
  tools: unknown[];
  metadata: Record<string, string>;
  token: string;
  expiresAt: number;
  startedAt: string;
  endedAt?: string;
}

export interface CallDocument {
  id: string;
  sessionId: string;
  to: string;
  from: string;
  status: "queued" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer";
  provider: VoiceProvider;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
}

export interface WorkflowDocument {
  id: string;
  name: string;
  definition: Record<string, unknown>;
  currentVersionId: string;
  deployedVersions: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
