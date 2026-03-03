#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${VOICERAILS_API_BASE_URL:-https://europe-west2-voicerails8.cloudfunctions.net/api}"
API_KEY="${VOICERAILS_API_KEY:-}"

if [[ -z "${API_KEY}" ]]; then
  echo "Set VOICERAILS_API_KEY before running smoke test."
  exit 1
fi

echo "Checking health..."
curl -fsS "${BASE_URL}/health" | jq .

echo "Creating session..."
CREATE_PAYLOAD="$(curl -fsS -X POST "${BASE_URL}/v1/sessions" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","systemPrompt":"Smoke test prompt","channel":"in_app"}')"
SESSION_ID="$(printf "%s" "${CREATE_PAYLOAD}" | jq -r '.id // empty')"
if [[ -z "${SESSION_ID}" ]]; then
  echo "Session creation did not return an id:"
  printf "%s\n" "${CREATE_PAYLOAD}" | jq .
  exit 1
fi

echo "Session ID: ${SESSION_ID}"
echo "Finalizing session..."
curl -fsS -X POST "${BASE_URL}/v1/sessions/${SESSION_ID}/finalize" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"transcript":[{"role":"user","text":"hello"},{"role":"assistant","text":"hi"}]}' | jq .

echo "Listing analytics..."
curl -fsS "${BASE_URL}/v1/analytics/usage" \
  -H "x-api-key: ${API_KEY}" | jq .

echo "Smoke test complete."
