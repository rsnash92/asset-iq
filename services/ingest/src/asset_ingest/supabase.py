"""Minimal Supabase client (PostgREST RPC + Storage) using the service-role key."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from .errors import DatabaseError, StorageError

BUCKET = "documents"


class SupabaseClient:
    def __init__(self, client: httpx.AsyncClient, url: str, service_key: str) -> None:
        self.client = client
        self.url = url.rstrip("/")
        self.headers = {"apikey": service_key}
        # Legacy JWT keys go in Authorization too; new sb_secret_ keys only in `apikey`.
        if service_key.startswith("eyJ"):
            self.headers["Authorization"] = f"Bearer {service_key}"

    async def rpc(self, fn: str, params: dict[str, Any]) -> Any:
        resp = await self.client.post(f"{self.url}/rest/v1/rpc/{fn}", headers=self.headers, json=params)
        if resp.status_code >= 400:
            raise DatabaseError(f"rpc {fn} HTTP {resp.status_code}: {resp.text[:300]}")
        return resp.json() if resp.content else None

    async def claim_document(self, document_id: str | None = None) -> dict | None:
        rows = await self.rpc("claim_document", {"p_document_id": document_id})
        return rows[0] if rows else None

    async def replace_chunks(self, document_id: str, page_count: int, chunks: list[dict]) -> int:
        return await self.rpc(
            "replace_document_chunks",
            {"p_document_id": document_id, "p_page_count": page_count, "p_chunks": chunks},
        )

    async def mark_failed(self, document_id: str, error: str, page_count: int | None = None) -> None:
        body: dict[str, Any] = {"status": "failed", "error": error}
        if page_count is not None:
            body["page_count"] = page_count
        resp = await self.client.patch(
            f"{self.url}/rest/v1/documents",
            params={"id": f"eq.{document_id}"},
            headers={**self.headers, "Prefer": "return=minimal"},
            json=body,
        )
        if resp.status_code >= 400:
            raise DatabaseError(f"mark_failed HTTP {resp.status_code}: {resp.text[:300]}")

    async def download(self, storage_path: str) -> bytes:
        path = quote(storage_path, safe="/")
        resp = await self.client.get(f"{self.url}/storage/v1/object/{BUCKET}/{path}", headers=self.headers)
        if resp.status_code != 200:
            raise StorageError(f"download HTTP {resp.status_code}: {resp.text[:200]}")
        return resp.content
