import { OpenAiAdapter } from "./openai.js";
import { GeminiAdapter } from "./gemini.js";
import { GrokAdapter } from "./grok.js";
import { ElevenLabsAdapter } from "./elevenlabs.js";
export function createProviderAdapter(provider, emitter, synthesizeSpeech) {
    switch (provider) {
        case "openai":
            return new OpenAiAdapter(emitter);
        case "gemini":
            return new GeminiAdapter(emitter);
        case "grok":
            return new GrokAdapter(emitter);
        case "elevenlabs":
            return new ElevenLabsAdapter(emitter, synthesizeSpeech);
        default: {
            const exhaustive = provider;
            throw new Error(`Unsupported provider ${exhaustive ?? "unknown"}`);
        }
    }
}
//# sourceMappingURL=index.js.map