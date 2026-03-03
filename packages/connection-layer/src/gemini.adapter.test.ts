import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {TypedEventEmitter} from "./events.js";
import {GeminiAdapter} from "./providers/gemini.js";

test("gemini adapter normalizes transcripts, audio, and tool calls", () => {
  const emitter = new TypedEventEmitter();
  const adapter = new GeminiAdapter(emitter) as any;

  const userEvents: Array<{text: string; isFinal: boolean}> = [];
  const assistantEvents: Array<{text: string; isFinal: boolean}> = [];
  const audioEvents: Array<{audioBase64: string}> = [];
  const toolCalls: Array<{name: string; args: Record<string, unknown>}> = [];
  let interrupted = 0;
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
  emitter.on("interrupted", () => {
    interrupted += 1;
  });
  emitter.on("turn_complete", () => {
    turnComplete += 1;
  });

  const baseDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(baseDir, "..", "src", "fixtures", "gemini.sequence.json");
  const replaySequence = JSON.parse(readFileSync(fixturePath, "utf8")) as Array<Record<string, unknown>>;

  for (const message of replaySequence) {
    adapter.handleProviderMessage(message);
  }

  assert.deepEqual(userEvents, [{text: "Hello  world", isFinal: false}]);
  assert.deepEqual(assistantEvents, [{text: "Assistant  reply", isFinal: false}]);
  assert.deepEqual(audioEvents, [{audioBase64: "AUDIO_BASE64"}]);
  assert.deepEqual(toolCalls, [{name: "lookupOrder", args: {orderId: "123"}}]);
  assert.equal(interrupted, 1);
  assert.equal(turnComplete, 1);
});
