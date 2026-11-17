import json

import httpx
import pytest
import respx

from asset_ingest.embeddings import OPENAI_EMBEDDINGS_URL, Embedder, to_pgvector
from asset_ingest.errors import EmbeddingConfigError, EmbeddingError
from asset_ingest.pipeline import embedding_text, process_document
from asset_ingest.supabase import SupabaseClient

SB = "http://sb.test"
DOC = {
    "id": "00000000-0000-0000-0000-000000000001",
    "title": "Managing contractors",
    "storage_path": "owner/doc/file.pdf",
    "mime_type": "application/pdf",
}
TEXT = "Employers must assess the risks to contractors working on site. " * 40


def fake_embeddings(request: httpx.Request) -> httpx.Response:
    body = json.loads(request.content)
    data = [{"index": i, "embedding": [0.01 * (i + 1)] * 1536} for i in range(len(body["input"]))]
    return httpx.Response(200, json={"data": data[::-1], "usage": {"total_tokens": 7 * len(data)}})


async def no_sleep(_: float) -> None:
    return None


def make(http: httpx.AsyncClient, **kw):
    return SupabaseClient(http, SB, "eyJservice"), Embedder(http, "sk-test", "m", sleep=no_sleep, **kw)


@respx.mock
async def test_happy_path_embeds_with_title_and_replaces_chunks(pdf_factory):
    respx.get(f"{SB}/storage/v1/object/documents/owner/doc/file.pdf").respond(
        200, content=pdf_factory([TEXT, TEXT])
    )
    embed_route = respx.post(OPENAI_EMBEDDINGS_URL).mock(side_effect=fake_embeddings)
    rpc = respx.post(f"{SB}/rest/v1/rpc/replace_document_chunks").respond(200, json=3)

    async with httpx.AsyncClient() as http:
        db, emb = make(http)
        stats = await process_document(DOC, db, emb, max_tokens=200, overlap_tokens=30)

    assert stats.status == "ready" and stats.pages == 2 and stats.chunks >= 2
    sent = json.loads(embed_route.calls[0].request.content)["input"]
    assert all(t.startswith("Managing contractors\n\n") for t in sent)

    payload = json.loads(rpc.calls[0].request.content)
    assert payload["p_document_id"] == DOC["id"] and payload["p_page_count"] == 2
    first = payload["p_chunks"][0]
    assert not first["content"].startswith("Managing contractors")  # raw content stored
    assert first["embedding"].startswith("[0.01,") and first["page_start"] == 1
    # vectors re-ordered by index despite reversed response
    assert payload["p_chunks"][1]["embedding"].startswith("[0.02,")
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


@respx.mock
async def test_embedding_retries_then_succeeds():
    calls = {"n": 0}

    def flaky(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, headers={"retry-after": "0"})
        return fake_embeddings(request)

    respx.post(OPENAI_EMBEDDINGS_URL).mock(side_effect=flaky)
    async with httpx.AsyncClient() as http:
        _, emb = make(http)
        result = await emb.embed(["a", "b"])
    assert calls["n"] == 3 and len(result.vectors) == 2 and result.total_tokens == 14


@respx.mock
async def test_embedding_gives_up_after_max_attempts():
    route = respx.post(OPENAI_EMBEDDINGS_URL).mock(side_effect=httpx.ConnectTimeout("t"))
    async with httpx.AsyncClient() as http:
        _, emb = make(http, max_attempts=3)
        with pytest.raises(EmbeddingError):
            await emb.embed(["a"])
    assert route.call_count == 3


@respx.mock
async def test_embedding_does_not_retry_client_errors():
    route = respx.post(OPENAI_EMBEDDINGS_URL).respond(400, json={"error": "bad"})
    async with httpx.AsyncClient() as http:
        _, emb = make(http)
        with pytest.raises(EmbeddingError):
            await emb.embed(["a"])
    assert route.call_count == 1


@respx.mock
async def test_embedding_batches_of_100():
    route = respx.post(OPENAI_EMBEDDINGS_URL).mock(side_effect=fake_embeddings)
    async with httpx.AsyncClient() as http:
        _, emb = make(http)
        result = await emb.embed([f"t{i}" for i in range(250)])
    sizes = [len(json.loads(c.request.content)["input"]) for c in route.calls]
    assert sizes == [100, 100, 50] and len(result.vectors) == 250


async def test_missing_api_key_fails_fast():
    async with httpx.AsyncClient() as http:
        with pytest.raises(EmbeddingConfigError) as err:
            await Embedder(http, "", "m").embed(["a"])
    assert "OPENAI_API_KEY" in err.value.user_message


def test_helpers():
    assert embedding_text("T", "body") == "T\n\nbody"
    assert to_pgvector([0.5, 1, -2.25]) == "[0.5,1.0,-2.25]"
