import json

import httpx
import pytest
import respx

from asset_ingest.embeddings import Embedder, to_pgvector
from asset_ingest.errors import EmbeddingError
from asset_ingest.pipeline import embedding_text, process_document
from asset_ingest.supabase import SupabaseClient
from tests.fakes import FakeModel

SB = "http://sb.test"
DOC = {
    "id": "00000000-0000-0000-0000-000000000001",
    "title": "Managing contractors",
    "storage_path": "owner/doc/file.pdf",
    "mime_type": "application/pdf",
}
TEXT = "Employers must assess the risks to contractors working on site. " * 40


NOMIC = "nomic-ai/nomic-embed-text-v1.5"


def make(http: httpx.AsyncClient, model: FakeModel | None = None):
    return SupabaseClient(http, SB, "eyJservice"), Embedder(NOMIC, dimensions=4, model=model or FakeModel())


@respx.mock
async def test_happy_path_embeds_with_title_and_replaces_chunks(pdf_factory):
    respx.get(f"{SB}/storage/v1/object/documents/owner/doc/file.pdf").respond(
        200, content=pdf_factory([TEXT, TEXT])
    )
    model = FakeModel()
    rpc = respx.post(f"{SB}/rest/v1/rpc/replace_document_chunks").respond(200, json=3)

    async with httpx.AsyncClient() as http:
        db, emb = make(http, model)
        stats = await process_document(DOC, db, emb, max_tokens=200, overlap_tokens=30)

    assert stats.status == "ready" and stats.pages == 2 and stats.chunks >= 2
    sent = model.calls[0]
    assert all(t.startswith("search_document: Managing contractors\n\n") for t in sent)

    payload = json.loads(rpc.calls[0].request.content)
    assert payload["p_document_id"] == DOC["id"] and payload["p_page_count"] == 2
    first = payload["p_chunks"][0]
    assert not first["content"].startswith("Managing contractors")  # raw content stored
    assert first["embedding"] == "[1.0,0.0,0.0,0.0]" and first["page_start"] == 1
    assert rpc.calls[0].request.headers["apikey"] == "eyJservice"


@respx.mock
async def test_scanned_pdf_marks_failed(pdf_factory):
    respx.get(url__startswith=f"{SB}/storage/").respond(200, content=pdf_factory(["", ""]))
    patch = respx.patch(f"{SB}/rest/v1/documents").respond(204)
    async with httpx.AsyncClient() as http:
        db, emb = make(http)
        stats = await process_document(DOC, db, emb)
    assert stats.status == "failed" and "scanned" in stats.error
    body = json.loads(patch.calls[0].request.content)
    assert body["status"] == "failed" and body["page_count"] == 2
    assert patch.calls[0].request.url.params["id"] == f"eq.{DOC['id']}"


@respx.mock
async def test_storage_error_marks_failed_with_safe_message():
    respx.get(url__startswith=f"{SB}/storage/").respond(404, json={"error": "not found"})
    patch = respx.patch(f"{SB}/rest/v1/documents").respond(204)
    async with httpx.AsyncClient() as http:
        db, emb = make(http)
        stats = await process_document(DOC, db, emb)
    assert stats.error == "Couldn't read the uploaded file from storage."
    assert json.loads(patch.calls[0].request.content)["error"] == stats.error


async def test_embedder_adds_nomic_task_prefixes_and_normalises():
    model = FakeModel(dims=4)
    emb = Embedder(NOMIC, dimensions=4, model=model)
    docs = await emb.embed(["chunk a", "chunk b"])
    query = await emb.embed(["who signs permits?"], "query")
    assert model.calls[0] == ["search_document: chunk a", "search_document: chunk b"]
    assert model.calls[1] == ["search_query: who signs permits?"]
    assert docs.vectors[0] == [1.0, 0.0, 0.0, 0.0]  # L2-normalised
    assert query.vectors[0] == [1.0, 0.0, 0.0, 0.0] and docs.total_tokens == 0


async def test_embedder_rejects_wrong_dimensions():
    emb = Embedder(NOMIC, dimensions=768, model=FakeModel(dims=4))
    with pytest.raises(EmbeddingError):
        await emb.embed(["a"])


async def test_embedder_wraps_model_failures():
    class Broken:
        def embed(self, documents, batch_size=32):
            raise RuntimeError("onnx exploded")

    with pytest.raises(EmbeddingError):
        await Embedder(NOMIC, dimensions=4, model=Broken()).embed(["a"])


async def test_unknown_model_gets_no_prefix():
    model = FakeModel(dims=4)
    await Embedder("some/other-model", dimensions=4, model=model).embed(["x"], "query")
    assert model.calls[0] == ["x"]


async def test_empty_input_skips_model():
    model = FakeModel()
    assert (await Embedder(NOMIC, dimensions=4, model=model).embed([])).vectors == []
    assert model.calls == []


def test_helpers():
    assert embedding_text("T", "body") == "T\n\nbody"
    assert to_pgvector([0.5, 1, -2.25]) == "[0.5,1.0,-2.25]"
