#!/usr/bin/env node
import {VoiceRails} from "@voicerails/sdk";

const [, , command, ...rest] = process.argv;
const apiKey = process.env.VOICERAILS_API_KEY;

if (!apiKey) {
  console.error("Set VOICERAILS_API_KEY before running the CLI.");
  process.exit(1);
}

const client = new VoiceRails({apiKey});

async function main(): Promise<void> {
  switch (command) {
    case "status":
      console.log("VoiceRails CLI is configured.");
      return;
    case "sessions:list": {
      const sessions = await client.sessions.list();
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }
    case "workflows:list": {
      const workflows = await client.workflows.list();
      console.log(JSON.stringify(workflows, null, 2));
      return;
    }
    case "numbers:list": {
      const numbers = await client.telephony.numbers.list();
      console.log(JSON.stringify(numbers, null, 2));
      return;
    }
    case "providers:list": {
      const response = await fetch(
        `${process.env.VOICERAILS_API_BASE_URL ?? "http://localhost:5001/voicerails8/europe-west2/api"}/v1/providers`,
        {
          headers: {
            "x-api-key": apiKey,
          },
        },
      );
      console.log(JSON.stringify(await response.json(), null, 2));
      return;
    }
    case "sessions:create": {
      const session = await client.sessions.create({
        provider: "openai",
        systemPrompt: "You are a test assistant for CLI smoke checks.",
      });
      console.log(JSON.stringify(session, null, 2));
      return;
    }
    case "workflows:execute": {
      const workflowId = rest[0];
      if (!workflowId) {
        console.error("Usage: voicerails workflows:execute <workflowId>");
        process.exit(1);
      }
      const result = await client.workflows.execute(workflowId, {});
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "usage":
      if (rest.length < 2) {
        console.error("Usage: voicerails usage <from-iso> <to-iso>");
        process.exit(1);
      }
      console.log(
        JSON.stringify(await client.analytics.usage({from: rest[0], to: rest[1]}), null, 2),
      );
      return;
    default:
      console.log(`Unknown command "${command ?? ""}".`);
      console.log(
        "Commands: status, sessions:list, sessions:create, workflows:list, workflows:execute, numbers:list, providers:list, usage",
      );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
