import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {REGION} from "./config.js";
import {app} from "./app.js";
import {syncUsageToStripe} from "./services/billing.js";

setGlobalOptions({
  region: REGION,
  maxInstances: 20,
});

export const api = onRequest(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  app,
);

export const billingSync = onSchedule(
  {
    region: REGION,
    schedule: "every 1 hours",
    timeZone: "Etc/UTC",
  },
  async () => {
    // Placeholder hourly sync job; pulls from BigQuery in later hardening iterations.
    await syncUsageToStripe({
      stripeCustomerId: process.env.STRIPE_DEFAULT_CUSTOMER_ID ?? "",
      meterEventName: "voicerails.voice.minutes",
      value: 0,
    });
  },
);
