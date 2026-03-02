export const REGION = "europe-west2";

export const DEFAULT_TENANT = {
  orgId: process.env.VOICERAILS_DEFAULT_ORG_ID ?? "default-org",
  appId: process.env.VOICERAILS_DEFAULT_APP_ID ?? "default-app",
  envId: process.env.VOICERAILS_DEFAULT_ENV_ID ?? "production",
};

export const API_KEY_PREFIXES = ["vr_live_", "vr_test_"] as const;

export const OPENAI_DEFAULT_MODEL = "gpt-realtime";
export const OPENAI_DEFAULT_VOICE = "alloy";
