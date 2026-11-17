import httpx
import pytest
import respx

from asset_evals.api import AssetIQClient, BackendUnavailable

SB, APP = "http://sb.test", "http://app.test"


def client():
    return AssetIQClient(APP, SB, "anon", "demo@x", "pw", sleep=lambda s: None)


@respx.mock
def test_signs_in_and_sends_bearer():
    token = respx.post(f"{SB}/auth/v1/token").respond(200, json={"access_token": "t1"})
    search = respx.post(f"{APP}/api/search").respond(200, json={"results": []})
    client().search("q", k=5, mode="hybrid", rerank=False, backend="pgvector")
    assert token.calls[0].request.url.params["grant_type"] == "password"
    assert token.calls[0].request.headers["apikey"] == "anon"
    assert search.calls[0].request.headers["authorization"] == "Bearer t1"


@respx.mock
def test_refreshes_once_on_401_and_waits_on_429():
    respx.post(f"{SB}/auth/v1/token").respond(200, json={"access_token": "t"})
    route = respx.post(f"{APP}/api/answer").mock(
        side_effect=[
            httpx.Response(401),
            httpx.Response(429, headers={"retry-after": "1"}),
            httpx.Response(200, json={"answer": "a"}),
        ]
    )
    assert client().answer("q", k=5, mode="hybrid", rerank=False, backend="pgvector") == {"answer": "a"}
    assert route.call_count == 3


@respx.mock
def test_501_means_backend_unavailable():
    respx.post(f"{SB}/auth/v1/token").respond(200, json={"access_token": "t"})
    respx.post(f"{APP}/api/search").respond(501, text="mongodb not configured")
    with pytest.raises(BackendUnavailable):
        client().search("q", k=5, mode="hybrid", rerank=False, backend="mongodb")


@respx.mock
def test_bad_credentials():
    respx.post(f"{SB}/auth/v1/token").respond(400, json={"error": "invalid_grant"})
    with pytest.raises(RuntimeError):
        client().sign_in()
