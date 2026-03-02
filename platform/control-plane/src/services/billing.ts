import {BigQuery} from "@google-cloud/bigquery";
import Stripe from "stripe";
import {getSecretValue} from "./secretManager.js";

const bigQuery = new BigQuery();

export interface BillingEvent {
  event_id: string;
  tenant_id: string;
  project_id: string;
  event_type: string;
  provider: string;
  duration_ms: number;
  tokens_in: number;
  tokens_out: number;
  provider_cost_usd: number;
  platform_fee_usd: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export async function appendBillingEvent(event: BillingEvent): Promise<void> {
  const dataset = process.env.BIGQUERY_DATASET ?? "usage_events";
  const table = process.env.BIGQUERY_TABLE ?? "events";
  try {
    await bigQuery.dataset(dataset).table(table).insert([event]);
  } catch {
    // Best-effort write for local/dev bootstrapping.
  }
}

export async function syncUsageToStripe(input: {
  stripeCustomerId: string;
  meterEventName: string;
  value: number;
  timestamp?: number;
}): Promise<void> {
  if (!input.stripeCustomerId) {
    return;
  }
  const secret = (await getSecretValue("STRIPE_SECRET_KEY")) ?? process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return;
  }
  const stripe = new Stripe(secret);
  await stripe.billing.meterEvents.create({
    event_name: input.meterEventName,
    payload: {
      stripe_customer_id: input.stripeCustomerId,
      value: String(input.value),
    },
    timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
  });
}
