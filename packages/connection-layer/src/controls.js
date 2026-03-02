const pauseToNudgeMs = {
    very_low: 1500,
    low: 2000,
    medium: 2800,
    high: 3500,
    very_high: 4500,
};
const guardToEchoMs = {
    low: 100,
    medium: 250,
    high: 400,
    very_high: 600,
};
const guardToSpeechThreshold = {
    low: 0.005,
    medium: 0.011,
    high: 0.015,
    very_high: 0.02,
};
export const BALANCED_ASSISTANT_PRESET = {
    pauseTolerance: "medium",
    interruptionSensitivity: "medium",
    falseInputGuard: "medium",
    turnCommitPolicy: "hybrid_fallback",
    responseTempo: "balanced",
};
export function resolveExperienceControls(partial) {
    const base = {
        ...BALANCED_ASSISTANT_PRESET,
        ...partial,
    };
    return {
        ...base,
        echoGuardMs: partial?.echoGuardMs ?? guardToEchoMs[base.falseInputGuard],
        speechEnergyThreshold: partial?.speechEnergyThreshold ?? guardToSpeechThreshold[base.falseInputGuard],
        turnNudgeMs: partial?.turnNudgeMs ?? pauseToNudgeMs[base.pauseTolerance],
    };
}
//# sourceMappingURL=controls.js.map