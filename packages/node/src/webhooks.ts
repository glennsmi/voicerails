import {createHmac, timingSafeEqual} from "node:crypto";

export interface VerifyWebhookSignatureInput {
  payload: string | Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
  toleranceSeconds?: number;
}

export interface CreateWebhookSignatureInput {
  payload: string | Buffer;
  timestamp: string;
  secret: string;
}

export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
  if (!input.signature || !input.timestamp) {
    return false;
  }
  const tolerance = input.toleranceSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) {
    return false;
  }
  const payload = typeof input.payload === "string" ? input.payload : input.payload.toString("utf8");
  const signedPayload = `${input.timestamp}.${payload}`;
  const digest = createHmac("sha256", input.secret).update(signedPayload).digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const actual = Buffer.from(input.signature, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createWebhookSignature(input: CreateWebhookSignatureInput): string {
  const payload = typeof input.payload === "string" ? input.payload : input.payload.toString("utf8");
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${payload}`)
    .digest("hex");
}
