import {createHmac} from "node:crypto";

export interface WebhookEventEnvelope<T = Record<string, unknown>> {
  id: string;
  type: string;
  createdAt: string;
  appId: string;
  environment: string;
  data: T;
}

export async function dispatchWebhookEvent(
  webhooks: Array<{url: string; secret: string; events: string[]; id?: string}>,
  event: WebhookEventEnvelope,
): Promise<void> {
  const matching = webhooks.filter((webhook) => webhook.events.includes(event.type));
  await Promise.all(
    matching.map(async (webhook) => {
      const payload = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac("sha256", webhook.secret)
        .update(`${timestamp}.${payload}`)
        .digest("hex");

      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-VoiceRails-Signature": signature,
              "X-VoiceRails-Timestamp": timestamp,
              "X-VoiceRails-Webhook-Id": webhook.id ?? "",
            },
            body: payload,
          });
          if (!response.ok) {
            throw new Error(`Webhook ${webhook.url} failed with ${response.status}`);
          }
          return;
        } catch (error) {
          lastError = error;
          await sleep((attempt + 1) * 1000);
        }
      }
      // eslint-disable-next-line no-console
      console.error("Webhook dispatch failed:", webhook.url, lastError);
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
