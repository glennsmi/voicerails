import {randomUUID} from "node:crypto";
import Twilio from "twilio";
import type {TenantContext} from "../types.js";
import {getSecretValue} from "./secretManager.js";
import type {FirestoreRepository} from "../repositories/firestoreRepository.js";

export interface ProvisionedNumber {
  id: string;
  e164: string;
  countryCode: string;
  numberType: string;
  capabilities: string[];
  lifecycleStatus: string;
}

type TwilioClient = ReturnType<typeof Twilio>;

async function getTwilioClient(): Promise<TwilioClient | null> {
  const accountSid = (await getSecretValue("TWILIO_ACCOUNT_SID")) ?? process.env.TWILIO_ACCOUNT_SID;
  const authToken = (await getSecretValue("TWILIO_AUTH_TOKEN")) ?? process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return null;
  }
  return Twilio(accountSid, authToken);
}

export async function searchNumbers(input: {
  country: string;
  type?: string;
  areaCode?: string;
}): Promise<ProvisionedNumber[]> {
  const twilio = await getTwilioClient();
  if (!twilio) {
    return [
      {
        id: `num_${randomUUID()}`,
        e164: "+14155550100",
        countryCode: input.country,
        numberType: input.type ?? "local",
        capabilities: ["voice_inbound", "voice_outbound"],
        lifecycleStatus: "available",
      },
    ];
  }

  const numbers = await twilio.availablePhoneNumbers(input.country).local.list({
    areaCode: input.areaCode ? Number(input.areaCode) : undefined,
    limit: 10,
  });
  return numbers.map((number: any) => ({
    id: `num_${number.phoneNumber}`,
    e164: number.phoneNumber,
    countryCode: input.country,
    numberType: input.type ?? "local",
    capabilities: ["voice_inbound", "voice_outbound", "sms"],
    lifecycleStatus: "available",
  }));
}

export async function provisionNumber(
  repo: FirestoreRepository,
  tenant: TenantContext,
  input: {country: string; type: string; specificNumber?: string},
): Promise<ProvisionedNumber> {
  const twilio = await getTwilioClient();
  const e164 = input.specificNumber ?? "+14155550199";

  if (twilio && input.specificNumber) {
    await twilio.incomingPhoneNumbers.create({
      phoneNumber: input.specificNumber,
    });
  }

  const record: ProvisionedNumber = {
    id: `num_${randomUUID()}`,
    e164,
    countryCode: input.country,
    numberType: input.type,
    capabilities: ["voice_inbound", "voice_outbound"],
    lifecycleStatus: "active",
  };
  await repo.numbersCollection(tenant).doc(record.id).set(record);
  return record;
}
