import type { ResolvedExperienceControls, ToolDeclaration, VoiceProvider } from "@voicerails/connection-layer";
export interface VoiceRailsClientOptions {
    apiKey: string;
    environment?: string;
    region?: string;
    baseUrl?: string;
}
export interface SessionCreateInput {
    provider?: VoiceProvider;
    voice?: string;
    systemPrompt: string;
    tools?: ToolDeclaration[];
    experienceControls?: string | Partial<ResolvedExperienceControls>;
    workflowId?: string;
    channel?: "in_app" | "telephony";
    metadata?: Record<string, string>;
    endUserId?: string;
    continueSessionId?: string;
}
export interface SessionRecord {
    id: string;
    provider: VoiceProvider;
    model: string;
    voice: string;
    status: "active" | "extracting" | "completed" | "failed";
    systemPrompt: string;
    metadata: Record<string, string>;
    createdAt: string;
}
export interface CallCreateInput {
    to: string;
    from: string;
    workflowId?: string;
    systemPrompt?: string;
    provider?: VoiceProvider;
    voice?: string;
    tools?: ToolDeclaration[];
    metadata?: Record<string, string>;
    endUserId?: string;
    scheduledAt?: string;
}
export interface WorkflowDefinition {
    version: "1.0";
    name: string;
    description?: string;
    config?: Record<string, unknown>;
    stages: Array<Record<string, unknown>>;
    tools?: ToolDeclaration[];
    onComplete?: Record<string, unknown>;
}
