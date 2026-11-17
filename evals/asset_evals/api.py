"""Client for the Asset IQ web API, authenticated as the demo user (Supabase password grant)."""

from __future__ import annotations

import time

import httpx


class BackendUnavailable(Exception):
    """The requested vector backend isn't configured (HTTP 501)."""


class AssetIQClient:
    def __init__(
        self,
        base_url: str,
        supabase_url: str,
        anon_key: str,
        email: str,
        password: str,
        timeout: float = 120.0,
        max_rate_limit_waits: int = 3,
        sleep=time.sleep,
    ) -> None:
        self.http = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout)
        self.supabase_url = supabase_url.rstrip("/")
        self.anon_key = anon_key
        self.email = email
        self.password = password
        self.max_rate_limit_waits = max_rate_limit_waits
        self.sleep = sleep
        self._token: str | None = None

    def sign_in(self) -> str:
        resp = httpx.post(
            f"{self.supabase_url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": self.anon_key},
            json={"email": self.email, "password": self.password},
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"demo user sign-in failed ({resp.status_code}): {resp.text[:200]}")
        self._token = resp.json()["access_token"]
        return self._token

    def _post(self, path: str, body: dict) -> dict:
        if not self._token:
            self.sign_in()
        refreshed = False
        waits = 0
        while True:
            resp = self.http.post(
                path,
                json=body,
                headers={"Authorization": f"Bearer {self._token}", "x-asset-iq-eval": "1"},
            )
            if resp.status_code == 401 and not refreshed:
                self.sign_in()
                refreshed = True
                continue
            if resp.status_code == 429 and waits < self.max_rate_limit_waits:
                waits += 1
                retry_after = float(resp.headers.get("retry-after", "60"))
                print(f"    rate limited; waiting {retry_after:.0f}s")
                self.sleep(retry_after)
                continue
            if resp.status_code == 501:
                raise BackendUnavailable(resp.text[:200])
            resp.raise_for_status()
            return resp.json()

    def search(self, query: str, *, k: int, mode: str, rerank: bool, backend: str) -> dict:
        return self._post(
            "/api/search", {"query": query, "k": k, "mode": mode, "rerank": rerank, "backend": backend}
        )

    def answer(self, question: str, *, k: int, mode: str, rerank: bool, backend: str) -> dict:
        return self._post(
            "/api/answer",
            {"question": question, "k": k, "mode": mode, "rerank": rerank, "backend": backend},
        )
