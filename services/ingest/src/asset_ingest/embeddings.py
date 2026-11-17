"""Local, open-source embeddings (fastembed / ONNX Runtime) — no API key, no per-call cost.

Default model: nomic-ai/nomic-embed-text-v1.5 (768-d, Apache-2.0, 8k-token context).
Nomic is trained with task prefixes, and fastembed does NOT add them for this model
(verified: `query_embed(x) == embed(x)`), so we add them explicitly:
    documents -> "search_document: ..."     queries -> "search_query: ..."
Vectors are L2-normalised so cosine == dot product on every backend.

This service is the single owner of the embedding model: ingestion embeds chunks
here, and the web app / MCP server embed queries via POST /embed — guaranteeing
the same model, prefixes and normalisation on both sides.
"""

from __future__ import annotations

import asyncio
import logging
import math
import threading
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from .errors import EmbeddingError

log = logging.getLogger(__name__)

Kind = Literal["query", "document"]

BGE_QUERY = "Represent this sentence for searching relevant passages: "

# Task prefixes per model family. Models not listed get no prefix.
PREFIXES: dict[str, dict[Kind, str]] = {
    "nomic-ai/nomic-embed-text-v1.5": {"query": "search_query: ", "document": "search_document: "},
    "nomic-ai/nomic-embed-text-v1.5-Q": {"query": "search_query: ", "document": "search_document: "},
    "BAAI/bge-base-en-v1.5": {
        "query": "Represent this sentence for searching relevant passages: ",
        "document": "",
    },
    "BAAI/bge-small-en-v1.5": {
        "query": "Represent this sentence for searching relevant passages: ",
        "document": "",
    },
}


class TextModel(Protocol):
    def embed(self, documents: Sequence[str], batch_size: int = ...) -> Iterable[Sequence[float]]: ...


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    total_tokens: int = 0  # local model: not billed, not counted


def _normalise(v: Sequence[float]) -> list[float]:
    n = math.sqrt(sum(float(x) * float(x) for x in v))
    if n == 0:
        raise EmbeddingError("embedding model returned a zero vector")
    return [float(x) / n for x in v]


class Embedder:
    def __init__(
        self,
        model_name: str,
        dimensions: int = 768,
        batch_size: int = 8,
        model: TextModel | None = None,
        cache_dir: str | None = None,
    ) -> None:
        self.model_name = model_name
        self.dimensions = dimensions
        self.batch_size = batch_size
        self.cache_dir = cache_dir
        self._model = model
        self._lock = threading.Lock()  # ONNX session is not shared across concurrent calls
        self._prefixes = PREFIXES.get(model_name, {"query": "", "document": ""})

    def _get_model(self) -> TextModel:
        if self._model is None:
            from fastembed import TextEmbedding  # heavy import, deferred

            log.info("loading embedding model %s", self.model_name)
            # The ONNX CPU arena keeps the high-water mark of every batch and never
            # releases it; disabling it bounds memory (see config.embed_batch_size).
            self._model = TextEmbedding(self.model_name, cache_dir=self.cache_dir, enable_cpu_mem_arena=False)
        return self._model

    def warm(self) -> None:
        """Load the model (and download it if not baked into the image)."""
        self._embed_sync(["warm-up"], "query")

    def _embed_sync(self, texts: list[str], kind: Kind) -> list[list[float]]:
        prefixed = [self._prefixes[kind] + t for t in texts]
        with self._lock:
            raw = list(self._get_model().embed(prefixed, batch_size=self.batch_size))
        if len(raw) != len(texts):
            raise EmbeddingError("embedding count mismatch")
        out = [_normalise(v) for v in raw]
        for v in out:
            if len(v) != self.dimensions:
                raise EmbeddingError(f"expected {self.dimensions}-d embeddings, got {len(v)}")
        return out

    async def embed(self, texts: list[str], kind: Kind = "document") -> EmbeddingResult:
        if not texts:
            return EmbeddingResult([])
        try:
            vectors = await asyncio.to_thread(self._embed_sync, texts, kind)
        except EmbeddingError:
            raise
        except Exception as exc:  # model load / runtime failure
            raise EmbeddingError(f"embedding failed: {exc}") from exc
        return EmbeddingResult(vectors)


def to_pgvector(vec: list[float]) -> str:
    """pgvector text literal, e.g. "[0.1,0.2]" (PostgREST casts it to vector)."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"
