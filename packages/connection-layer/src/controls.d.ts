import type { ResolvedExperienceControls } from "./types.js";
export declare const BALANCED_ASSISTANT_PRESET: Omit<ResolvedExperienceControls, "echoGuardMs" | "speechEnergyThreshold" | "turnNudgeMs">;
export declare function resolveExperienceControls(partial?: Partial<ResolvedExperienceControls>): ResolvedExperienceControls;
