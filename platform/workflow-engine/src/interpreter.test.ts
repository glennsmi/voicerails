import assert from "node:assert/strict";
import test from "node:test";
import {WorkflowInterpreter} from "./interpreter.js";
import type {WorkflowDefinition, WorkflowRuntimeContext} from "./types.js";

test("workflow interpreter runs stage graph with condition branch", async () => {
  const definition: WorkflowDefinition = {
    version: "1.0",
    name: "condition-branch",
    stages: [
      {id: "greet", type: "greeting", next: "extract"},
      {id: "extract", type: "extraction", next: "cond", schema: {field: "email"}},
      {id: "cond", type: "condition", expression: "extractions.present", ifTrue: "end"},
      {id: "end", type: "end"},
    ],
  };

  const interpreter = new WorkflowInterpreter(definition);
  const context: WorkflowRuntimeContext = {extractions: {}, memory: {}, metadata: {}};
  const steps = await interpreter.run(context);

  assert.deepEqual(
    steps.map((step) => step.stageId),
    ["greet", "extract", "cond", "end"],
  );
  assert.ok(context.extractions["extract"]);
  assert.equal(steps[2].outputs?.passes, true);
});

test("memory_write stage persists data for memory_read stage", async () => {
  const definition: WorkflowDefinition = {
    version: "1.0",
    name: "memory-roundtrip",
    stages: [
      {id: "write", type: "memory_write", key: "tier", value: "gold", next: "read"},
      {id: "read", type: "memory_read", key: "tier", next: "end"},
      {id: "end", type: "end"},
    ],
  };

  const interpreter = new WorkflowInterpreter(definition);
  const context: WorkflowRuntimeContext = {extractions: {}, memory: {}, metadata: {}};
  const steps = await interpreter.run(context);

  assert.equal(context.memory["tier"], "gold");
  assert.equal(steps[1].outputs?.value, "gold");
});
