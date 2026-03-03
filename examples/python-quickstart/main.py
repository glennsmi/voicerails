from voicerails import VoiceRails
import os

api_key = os.environ.get("VOICERAILS_API_KEY")
if not api_key:
    raise RuntimeError("Set VOICERAILS_API_KEY")

client = VoiceRails(
    api_key=api_key,
    base_url=os.environ.get("VOICERAILS_API_BASE_URL", "http://localhost:5001/voicerails8/europe-west2/api"),
)

session = client.sessions.create(
    {
        "provider": "openai",
        "systemPrompt": "You are a friendly assistant",
    }
)
print("Session:", session["id"])
