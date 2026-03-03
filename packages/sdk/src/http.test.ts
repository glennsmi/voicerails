import assert from "node:assert/strict";
import test from "node:test";
import {HttpClient} from "./http.js";

test("http client sends auth header and parses JSON response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedUrl = "";
    let capturedAuth = "";
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedAuth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
      return new Response(JSON.stringify({ok: true}), {
        status: 200,
        headers: {"Content-Type": "application/json"},
      });
    }) as typeof fetch;

    const client = new HttpClient("https://api.example.com", "vr_test_123");
    const payload = await client.get<{ok: boolean}>("/health");

    assert.equal(capturedUrl, "https://api.example.com/health");
    assert.equal(capturedAuth, "Bearer vr_test_123");
    assert.deepEqual(payload, {ok: true});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http client surfaces API error message", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {message: "Provider not configured"},
        }),
        {status: 400, headers: {"Content-Type": "application/json"}},
      )) as typeof fetch;

    const client = new HttpClient("https://api.example.com", "vr_test_123");
    await assert.rejects(async () => client.post("/v1/sessions", {}), /Provider not configured/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
