# VoiceRails Control Plane

Firebase Functions v2 API deployed to `us-central1`.

## Key Endpoints

- `/health`
- `/v1/sessions`
- `/v1/calls`
- `/v1/workflows`
- `/v1/telephony/numbers/*`
- `/v1/webhooks`
- `/v1/analytics/*`
- `/v1/providers`

## Secrets

Secrets are resolved from environment first, then Secret Manager:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROK_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `STRIPE_SECRET_KEY`
