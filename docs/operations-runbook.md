# VoiceRails Operations Runbook

## Regions and Data Placement

- Functions: `europe-west2`
- App Hosting: `europe-west2`
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

Optional local-development fallback:

- `ALLOW_MOCK_PROVIDER_TOKENS=true` (disabled by default)

## Bridge Recovery and Failover

Telephony bridge runtime supports reconnect + optional provider failover:

- `BRIDGE_MAX_RECONNECT_ATTEMPTS` (default: `2`)
- `BRIDGE_RECONNECT_BACKOFF_MS` (default: `750`)
- `BRIDGE_FALLBACK_PROVIDER` (optional: `openai|gemini|grok|elevenlabs`)

Tool calls can be executed by an external runtime:

- `BRIDGE_TOOL_RUNTIME_URL` (optional HTTP endpoint)
- `BRIDGE_TOOL_RUNTIME_AUTH_TOKEN` (optional bearer token)

## Smoke Test

```bash
VOICERAILS_API_KEY=vr_test_xxx ./scripts/smoke-test.sh
```

## Provider Compatibility Check

```bash
npm run compat:providers
```

## Incident Checks

1. `firebase functions:list`
2. `firebase functions:log --only api --lines 100`
3. Bridge `/health` endpoint check
4. Query `/v1/analytics/slo` and compare against target thresholds
5. Verify Firestore writes in:
   - `orgs/{orgId}/apps/{appId}/envs/{envId}/sessions`
   - `billingEvents`
