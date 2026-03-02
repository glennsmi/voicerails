import type {VoiceProvider} from "@voicerails/connection-layer";

const providerRatesPerMinuteUsd: Record<VoiceProvider, number> = {
  openai: 0.015,
  gemini: 0.012,
  elevenlabs: 0.02,
  grok: 0.016,
};

export function estimateSessionCosts(input: {
  provider: VoiceProvider;
  durationMs: number;
  platformMarkupPct?: number;
}): {
  providerCostUsd: number;
  platformFeeUsd: number;
  totalUsd: number;
} {
  const minutes = Math.max(0, input.durationMs) / 60000;
  const providerCostUsd = minutes * providerRatesPerMinuteUsd[input.provider];
  const markup = input.platformMarkupPct ?? 0.2;
  const platformFeeUsd = providerCostUsd * markup;
  return {
    providerCostUsd: round(providerCostUsd),
    platformFeeUsd: round(platformFeeUsd),
    totalUsd: round(providerCostUsd + platformFeeUsd),
  };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
