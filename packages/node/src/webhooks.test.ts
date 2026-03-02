import test from "node:test";
import assert from "node:assert/strict";
import {createWebhookSignature, verifyWebhookSignature} from "./webhooks.js";

test("webhook signature roundtrip", () => {
  const payload = JSON.stringify({ok: true});
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = "whsec_test_secret";
  const signature = createWebhookSignature({payload, timestamp, secret});

  const valid = verifyWebhookSignature({
    payload,
    signature,
    timestamp,
    secret,
    toleranceSeconds: 60,
  });

  assert.equal(valid, true);
});
