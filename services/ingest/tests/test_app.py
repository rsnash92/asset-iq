import httpx
import respx
from fastapi.testclient import TestClient

from asset_ingest.app import create_app
from asset_ingest.config import Settings

SB = "http://sb.test"
DOC_ID = "00000000-0000-0000-0000-000000000001"


def client() -> TestClient:
    settings = Settings(
        supabase_url=SB,
        supabase_service_role_key="sb_secret_x",
        ingest_shared_secret="s3cret",
        worker_enabled=False,
        openai_api_key="",
    )
    return TestClient(create_app(settings))


def test_health():
    with client() as c:
        assert c.get("/health").json() == {"status": "ok", "worker": False}


def test_ingest_requires_secret():
    with client() as c:
        assert c.post("/ingest", json={"document_id": DOC_ID}).status_code == 401
        r = c.post("/ingest", json={"document_id": DOC_ID}, headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401


def test_ingest_validates_uuid():
    with client() as c:
        r = c.post("/ingest", json={"document_id": "x"}, headers={"Authorization": "Bearer s3cret"})
        assert r.status_code == 422


@respx.mock
def test_ingest_not_pending_returns_202():
    respx.post(f"{SB}/rest/v1/rpc/claim_document").respond(200, json=[])
    with client() as c:
        r = c.post("/ingest", json={"document_id": DOC_ID}, headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 202 and r.json()["status"] == "not_pending"


@respx.mock
def test_ingest_claims_and_processes_in_background():
    claim = respx.post(f"{SB}/rest/v1/rpc/claim_document").respond(
        200,
        json=[{"id": DOC_ID, "title": "T", "storage_path": "a/b/c.txt", "mime_type": "text/plain"}],
    )
    respx.get(f"{SB}/storage/v1/object/documents/a/b/c.txt").respond(200, content=b"tiny")
    failed = respx.patch(f"{SB}/rest/v1/documents").respond(204)
    with client() as c:
        r = c.post("/ingest", json={"document_id": DOC_ID}, headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 202 and r.json()["status"] == "processing"
    assert claim.calls[0].request.headers["apikey"] == "sb_secret_x"
    assert "authorization" not in claim.calls[0].request.headers  # sb_secret keys only in apikey
    assert failed.called  # "tiny" text has too few chars -> marked failed
    assert isinstance(failed.calls[0].request, httpx.Request)
