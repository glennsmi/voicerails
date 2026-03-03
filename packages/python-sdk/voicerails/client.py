from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

import requests


@dataclass
class VoiceRails:
    api_key: str
    base_url: str = "http://localhost:5001/voicerails8/europe-west2/api"

    def _headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def _get(self, path: str) -> Any:
        response = requests.get(f"{self.base_url}{path}", headers=self._headers(), timeout=30)
        response.raise_for_status()
        return response.json()

    def _post(self, path: str, payload: Dict[str, Any]) -> Any:
        response = requests.post(
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    class SessionsApi:
        def __init__(self, client: "VoiceRails") -> None:
            self.client = client

        def create(self, payload: Dict[str, Any]) -> Any:
            return self.client._post("/v1/sessions", payload)

        def list(self) -> Any:
            return self.client._get("/v1/sessions")

        def get(self, session_id: str) -> Any:
            return self.client._get(f"/v1/sessions/{session_id}")

    class CallsApi:
        def __init__(self, client: "VoiceRails") -> None:
            self.client = client

        def create(self, payload: Dict[str, Any]) -> Any:
            return self.client._post("/v1/calls", payload)

        def list(self) -> Any:
            return self.client._get("/v1/calls")

    @property
    def sessions(self) -> "VoiceRails.SessionsApi":
        return VoiceRails.SessionsApi(self)

    @property
    def calls(self) -> "VoiceRails.CallsApi":
        return VoiceRails.CallsApi(self)
