import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {TypedEventEmitter} from "./events.js";
import {ElevenLabsAdapter} from "./providers/elevenlabs.js";

test("elevenlabs adapter replays transcript, audio synthesis, and tool calls", async () => {
  const emitter = new TypedEventEmitter();
  const adapter = new ElevenLabsAdapter(emitter, async (_text, _voiceId) => "TTS_AUDIO_BASE64") as any;

  const userEvents: Array<{text: string; isFinal: boolean}> = [];
  const assistantEvents: Array<{text: string; isFinal: boolean}> = [];
  const audioEvents: Array<{audioBase64: string}> = [];
  const toolCalls: Array<{name: string; args: Record<string, unknown>}> = [];
  let turnComplete = 0;

  emitter.on("user_transcript", (event) => {
    userEvents.push({text: event.text, isFinal: event.isFinal});
  });
  emitter.on("assistant_transcript", (event) => {
    assistantEvents.push({text: event.text, isFinal: event.isFinal});
  });
  emitter.on("assistant_audio", (event) => {
    audioEvents.push({audioBase64: event.audioBase64});
  });
  emitter.on("tool_call", (event) => {
    toolCalls.push({name: event.name, args: event.args});
  });
  emitter.on("turn_complete", () => {
    turnComplete += 1;
  });

  const baseDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(baseDir, "..", "src", "fixtures", "elevenlabs.sequence.json");
  const replaySequence = JSON.parse(readFileSync(fixturePath, "utf8")) as Array<Record<string, unknown>>;
  for (const message of replaySequence) {
    adapter.handleProviderMessage(message);
  }
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(userEvents, [
    {text: "hello", isFinal: false},
    {text: "hello there", isFinal: true},
  ]);
  assert.deepEqual(assistantEvents, [
    {text: "Hi", isFinal: false},
    {text: "Hi there", isFinal: false},
    {text: "Hi there", isFinal: true},
  ]);
  assert.deepEqual(audioEvents, [{audioBase64: "TTS_AUDIO_BASE64"}]);
  assert.deepEqual(toolCalls, [{name: "lookupAccount", args: {accountId: "acct_1"}}]);
  assert.equal(turnComplete, 1);
});
