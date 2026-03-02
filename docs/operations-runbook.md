# VoiceRails Operations Runbook

## Regions and Data Placement

- Functions: `us-central1`
- App Hosting: `us-central1`
- Firestore: `nam5`

## Deploy Control Plane

```bash
npm run build --workspace @voicerails/control-plane
firebase deploy --only functions --force
```

## Deploy Dashboard

```bash
npm run build --workspace @voicerails/dashboard
firebase deploy --only hosting
```

## Deploy Telephony Bridge (Cloud Run)

```bash
npm run deploy:bridge
```

## Required Secrets (set later)

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROK_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `STRIPE_SECRET_KEY`

## Smoke Test

```bash
VOICERAILS_API_KEY=vr_test_xxx ./scripts/smoke-test.sh
```

## Incident Checks

1. `firebase functions:list`
2. `firebase functions:log --only api --lines 100`
3. Bridge `/health` endpoint check
4. Verify Firestore writes in:
   - `orgs/{orgId}/apps/{appId}/envs/{envId}/sessions`
   - `billingEvents`
