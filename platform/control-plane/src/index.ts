import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {REGION} from "./config.js";
import {app} from "./app.js";
import {db} from "./firebase.js";
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
    const stripeCustomerId = process.env.STRIPE_DEFAULT_CUSTOMER_ID ?? "";
    if (!stripeCustomerId) {
      return;
    }

    const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const eventsSnapshot = await db
      .collection("billingEvents")
      .where("timestamp", ">=", oneHourAgoIso)
      .get();
    const totalMinutes = eventsSnapshot.docs.reduce((sum, doc) => {
      const data = doc.data();
      return sum + Number(data.durationMs ?? 0) / 60000;
    }, 0);
    if (totalMinutes <= 0) {
      return;
    }

    await syncUsageToStripe({
      stripeCustomerId,
      meterEventName: "voicerails.voice.minutes",
      value: Math.ceil(totalMinutes),
    });
  },
);
