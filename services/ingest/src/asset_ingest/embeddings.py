"""OpenAI embeddings over plain httpx, batched, with retry + exponential backoff."""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx

from .errors import EmbeddingConfigError, EmbeddingError

log = logging.getLogger(__name__)

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    total_tokens: int


class Embedder:
    def __init__(
        self,
        client: httpx.AsyncClient,
        api_key: str,
        model: str,
        dimensions: int = 1536,
        batch_size: int = 100,
        max_attempts: int = 5,
        base_delay: float = 1.0,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.client = client
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions
        self.batch_size = batch_size
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.sleep = sleep

    async def embed(self, texts: list[str]) -> EmbeddingResult:
        if not self.api_key:
            raise EmbeddingConfigError("OPENAI_API_KEY is not set")
        vectors: list[list[float]] = []
        tokens = 0
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            data = await self._request(batch)
            ordered = sorted(data["data"], key=lambda d: d["index"])
            if len(ordered) != len(batch):
                raise EmbeddingError("embedding count mismatch")
            for item in ordered:
                if len(item["embedding"]) != self.dimensions:
                    raise EmbeddingError("unexpected embedding dimensions")
                vectors.append(item["embedding"])
            tokens += int(data.get("usage", {}).get("total_tokens", 0))
        return EmbeddingResult(vectors, tokens)

    async def _request(self, batch: list[str]) -> dict:
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            retry_after: float | None = None
            try:
                resp = await self.client.post(
                    OPENAI_EMBEDDINGS_URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"model": self.model, "input": batch},
                )
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code not in RETRYABLE_STATUS:
                    raise EmbeddingError(f"embeddings HTTP {resp.status_code}: {resp.text[:200]}")
                last_error = EmbeddingError(f"embeddings HTTP {resp.status_code}")
                header = resp.headers.get("retry-after")
                if header and header.replace(".", "", 1).isdigit():
                    retry_after = float(header)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
            if attempt < self.max_attempts:
                delay = retry_after or self.base_delay * 2 ** (attempt - 1)
                delay += random.uniform(0, self.base_delay)  # jitter
                log.warning("embedding attempt %d failed (%s); retrying in %.1fs", attempt, last_error, delay)
                await self.sleep(delay)
        raise EmbeddingError(f"embeddings failed after {self.max_attempts} attempts") from last_error


def to_pgvector(vec: list[float]) -> str:
    """pgvector text literal: "[0.1,0.2,...]"."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"
