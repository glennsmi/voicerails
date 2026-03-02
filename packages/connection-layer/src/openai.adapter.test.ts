import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import test from "node:test";
import {TypedEventEmitter} from "./events.js";
import {OpenAiAdapter} from "./providers/openai.js";

test("openai adapter normalizes transcript and turn events", () => {
  const emitter = new TypedEventEmitter();
  const adapter = new OpenAiAdapter(emitter) as any;

  const userEvents: Array<{text: string; isFinal: boolean}> = [];
  const assistantEvents: Array<{text: string; isFinal: boolean}> = [];
  let turnComplete = 0;

  emitter.on("user_transcript", (event) => {
    userEvents.push({text: event.text, isFinal: event.isFinal});
  });
  emitter.on("assistant_transcript", (event) => {
    assistantEvents.push({text: event.text, isFinal: event.isFinal});
  });
  emitter.on("turn_complete", () => {
    turnComplete += 1;
  });

  const baseDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(baseDir, "..", "src", "fixtures", "openai.sequence.json");
  const replaySequence = JSON.parse(readFileSync(fixturePath, "utf8")) as Array<Record<string, unknown>>;

  for (const message of replaySequence) {
    adapter.handleProviderMessage(message);
  }

  assert.deepEqual(userEvents, [
    {text: "hello", isFinal: false},
    {text: "hello there", isFinal: true},
  ]);
  assert.deepEqual(assistantEvents, [
    {text: "Hi", isFinal: false},
    {text: "Hi there!", isFinal: true},
  ]);
  assert.equal(turnComplete, 1);
});
