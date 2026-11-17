"""FastAPI app: POST /ingest trigger + background polling worker."""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import UUID

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .embeddings import Embedder
from .errors import EmbeddingError
from .pipeline import process_document
from .supabase import SupabaseClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("asset_ingest")


class IngestRequest(BaseModel):
    document_id: UUID


class EmbedRequest(BaseModel):
    """Query/document embedding for the web app and MCP server (same model as ingestion)."""

    texts: list[Annotated[str, Field(min_length=1, max_length=8000)]] = Field(min_length=1, max_length=32)
    kind: Literal["query", "document"] = "query"


class Services:
    def __init__(self, settings: Settings, http: httpx.AsyncClient, embedder: Embedder | None = None) -> None:
        self.settings = settings
        self.db = SupabaseClient(http, settings.supabase_url, settings.supabase_service_role_key)
        self.embedder = embedder or Embedder(
            settings.embedding_model,
            dimensions=settings.embedding_dimensions,
            batch_size=settings.embed_batch_size,
            cache_dir=settings.embedding_cache_dir,
        )
        self.semaphore = asyncio.Semaphore(settings.max_concurrent_documents)

    async def run(self, doc: dict) -> None:
        async with self.semaphore:
            await process_document(
                doc,
                self.db,
                self.embedder,
                self.settings.chunk_max_tokens,
                self.settings.chunk_overlap_tokens,
            )


async def worker_loop(services: Services, stop: asyncio.Event) -> None:
    """Poll for pending documents; claim_document uses FOR UPDATE SKIP LOCKED."""
    interval = services.settings.poll_interval_seconds
    while not stop.is_set():
        try:
            doc = await services.db.claim_document(None)
            if doc:
                await services.run(doc)
                continue  # drain the queue before sleeping
        except Exception:
            log.exception("worker iteration failed")
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval)


def create_app(settings: Settings | None = None, embedder: Embedder | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.http_timeout_seconds)) as http:
            services = Services(settings, http, embedder)
            app.state.services = services
            if settings.embedding_warmup:
                # load the ONNX model before serving so the first query isn't slow
                await asyncio.to_thread(services.embedder.warm)
            stop = asyncio.Event()
            task = asyncio.create_task(worker_loop(services, stop)) if settings.worker_enabled else None
            try:
                yield
            finally:
                stop.set()
                if task:
                    await task

    app = FastAPI(title="Asset IQ ingest", lifespan=lifespan)

    def require_secret(authorization: str = Header(default="")) -> None:
        expected = settings.ingest_shared_secret
        supplied = authorization.removeprefix("Bearer ").strip()
        if not expected or not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid ingest secret")

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "worker": settings.worker_enabled,
            "embedding_model": settings.embedding_model,
        }

    @app.post("/embed", dependencies=[Depends(require_secret)])
    async def embed(body: EmbedRequest) -> dict:
        services: Services = app.state.services
        try:
            result = await services.embedder.embed(body.texts, body.kind)
        except EmbeddingError as exc:
            log.exception("embed failed")
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "embedding unavailable") from exc
        return {
            "model": settings.embedding_model,
            "dimensions": settings.embedding_dimensions,
            "embeddings": result.vectors,
        }

    @app.post("/ingest", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_secret)])
    async def ingest(body: IngestRequest, background: BackgroundTasks) -> dict:
        services: Services = app.state.services
        doc = await services.db.claim_document(str(body.document_id))
        if not doc:
            # Already claimed by the worker, already ready, or unknown id.
            return {"document_id": str(body.document_id), "status": "not_pending"}
        background.add_task(services.run, doc)
        return {"document_id": str(body.document_id), "status": "processing"}

    return app


app = create_app()
