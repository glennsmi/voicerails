import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {TypedEventEmitter} from "./events.js";
import {GrokAdapter} from "./providers/grok.js";

test("grok adapter emits normalized events and duplicate detection", () => {
  const emitter = new TypedEventEmitter();
  const adapter = new GrokAdapter(emitter) as any;

  const userEvents: Array<{text: string; isFinal: boolean}> = [];
  const assistantEvents: Array<{text: string; isFinal: boolean}> = [];
  const audioEvents: Array<{audioBase64: string}> = [];
  const toolCalls: Array<{name: string; args: Record<string, unknown>}> = [];
  const duplicates: string[] = [];
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
  emitter.on("duplicate_response_detected", (event) => {
    duplicates.push(event.text);
  });
  emitter.on("turn_complete", () => {
    turnComplete += 1;
  });

  const baseDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(baseDir, "..", "src", "fixtures", "grok.sequence.json");
  const replaySequence = JSON.parse(readFileSync(fixturePath, "utf8")) as Array<Record<string, unknown>>;

  for (const message of replaySequence) {
    adapter.handleProviderMessage(message);
  }

  assert.deepEqual(userEvents, [{text: "hello there", isFinal: true}]);
  assert.deepEqual(audioEvents, [{audioBase64: "AUDIO_1"}]);
  assert.deepEqual(assistantEvents, [
    {text: "Hello", isFinal: false},
    {text: "Hello there", isFinal: true},
    {text: " hello   there ", isFinal: true},
  ]);
  assert.deepEqual(toolCalls, [{name: "lookupPolicy", args: {policyId: "abc"}}]);
  assert.deepEqual(duplicates, [" hello   there "]);
  assert.equal(turnComplete, 1);
});
