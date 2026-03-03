#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${VOICERAILS_API_BASE_URL:-https://europe-west2-voicerails8.cloudfunctions.net/api}"
API_KEY="${VOICERAILS_API_KEY:-}"

if [[ -z "${API_KEY}" ]]; then
  echo "Set VOICERAILS_API_KEY before running smoke test."
  exit 1
fi

echo "Checking health..."
curl -sS "${BASE_URL}/health" | jq .

echo "Creating session..."
SESSION_ID="$(curl -sS -X POST "${BASE_URL}/v1/sessions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","systemPrompt":"Smoke test prompt","channel":"in_app"}' | jq -r '.id')"

echo "Session ID: ${SESSION_ID}"
echo "Finalizing session..."
curl -sS -X POST "${BASE_URL}/v1/sessions/${SESSION_ID}/finalize" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"transcript":[{"role":"user","text":"hello"},{"role":"assistant","text":"hi"}]}' | jq .

echo "Listing analytics..."
curl -sS "${BASE_URL}/v1/analytics/usage" \
  -H "Authorization: Bearer ${API_KEY}" | jq .

echo "Smoke test complete."
