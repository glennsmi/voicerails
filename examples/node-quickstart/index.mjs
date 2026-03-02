import {VoiceRails} from "@voicerails/sdk";

const apiKey = process.env.VOICERAILS_API_KEY;
if (!apiKey) {
  throw new Error("Set VOICERAILS_API_KEY");
}

const client = new VoiceRails({
  apiKey,
  baseUrl: process.env.VOICERAILS_API_BASE_URL,
});

const session = await client.sessions.create({
  provider: "openai",
  systemPrompt: "You are a friendly intake assistant.",
  tools: [],
});

console.log("Session created:", session.id);
