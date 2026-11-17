"""Seed the sample corpus into Asset IQ for a demo user.

    uv run python seed.py                      # all documents in the manifest
    uv run python seed.py --limit 5            # first five (Phase 1 acceptance)
    uv run python seed.py --only indg368,hsg159
    uv run python seed.py --reingest           # existing docs -> status pending again

Idempotent on (owner_id, external_ref = manifest slug): documents already seeded
are skipped unless --reingest. Uploads go to Storage at
``<owner_id>/<document_id>/<filename>`` and rows start as ``pending``; the ingest
service's polling worker picks them up. If INGEST_SERVICE_URL and
INGEST_SHARED_SECRET are set, each document is also triggered immediately.

Env (read from ../.env if present): SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL),
SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL, DEMO_USER_PASSWORD,
INGEST_SERVICE_URL, INGEST_SHARED_SECRET.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

import httpx

from envfile import load_env

HERE = Path(__file__).parent
FILES = HERE / "files"


class Supabase:
    def __init__(self, url: str, key: str) -> None:
        headers = {"apikey": key}
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"
        self.http = httpx.Client(base_url=url.rstrip("/"), headers=headers, timeout=60)

    def find_user(self, email: str) -> dict | None:
        page = 1
        while True:
            resp = self.http.get("/auth/v1/admin/users", params={"page": page, "per_page": 200})
            resp.raise_for_status()
            users = resp.json().get("users", [])
            for user in users:
                if (user.get("email") or "").lower() == email.lower():
                    return user
            if len(users) < 200:
                return None
            page += 1

    def ensure_user(self, email: str, password: str) -> str:
        user = self.find_user(email)
        if user:
            # Keep the demo password in sync with .env so evals can sign in.
            resp = self.http.put(f"/auth/v1/admin/users/{user['id']}", json={"password": password})
            resp.raise_for_status()
            return user["id"]
        resp = self.http.post(
            "/auth/v1/admin/users", json={"email": email, "password": password, "email_confirm": True}
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def existing_documents(self, owner_id: str) -> dict[str, dict]:
        resp = self.http.get(
            "/rest/v1/documents",
            params={
                "owner_id": f"eq.{owner_id}",
                "external_ref": "not.is.null",
                "select": "id,external_ref,status",
            },
        )
        resp.raise_for_status()
        return {row["external_ref"]: row for row in resp.json()}

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        resp = self.http.post(
            f"/storage/v1/object/documents/{path}",
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "true"},
        )
        resp.raise_for_status()

    def delete_object(self, path: str) -> None:
        self.http.request("DELETE", "/storage/v1/object/documents", json={"prefixes": [path]})

    def insert_document(self, row: dict) -> None:
        resp = self.http.post("/rest/v1/documents", json=row, headers={"Prefer": "return=minimal"})
        resp.raise_for_status()

    def set_pending(self, document_id: str) -> None:
        resp = self.http.patch(
            "/rest/v1/documents",
            params={"id": f"eq.{document_id}"},
            json={"status": "pending", "error": None},
            headers={"Prefer": "return=minimal"},
        )
        resp.raise_for_status()


def trigger_ingest(document_id: str) -> str:
    url, secret = os.environ.get("INGEST_SERVICE_URL"), os.environ.get("INGEST_SHARED_SECRET")
    if not url or not secret:
        return "queued (worker)"
    try:
        resp = httpx.post(
            f"{url.rstrip('/')}/ingest",
            json={"document_id": document_id},
            headers={"Authorization": f"Bearer {secret}"},
            timeout=10,
        )
        return f"triggered ({resp.json().get('status', resp.status_code)})"
    except httpx.HTTPError:
        return "queued (ingest service unreachable; worker will pick it up)"


def main() -> int:
    load_env(HERE.parent / ".env", HERE.parent / ".env.local")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int)
    parser.add_argument("--only", help="comma-separated slugs")
    parser.add_argument("--reingest", action="store_true")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    email = os.environ.get("DEMO_USER_EMAIL", "demo@asset-iq.local")
    password = os.environ.get("DEMO_USER_PASSWORD")
    if not (url and key and password):
        print("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_USER_PASSWORD (in .env).")
        return 2

    docs = json.loads((HERE / "manifest.json").read_text())["documents"]
    if args.only:
        wanted = set(args.only.split(","))
        docs = [d for d in docs if d["slug"] in wanted]
    if args.limit:
        docs = docs[: args.limit]

    sb = Supabase(url, key)
    owner_id = sb.ensure_user(email, password)
    print(f"demo user {email} -> {owner_id}")
    existing = sb.existing_documents(owner_id)

    missing = [d["slug"] for d in docs if not (FILES / d["filename"]).exists()]
    if missing:
        print(f"Missing files for: {', '.join(missing)} — run `uv run python download.py` first.")
        return 1

    for doc in docs:
        slug = doc["slug"]
        if slug in existing:
            row = existing[slug]
            if args.reingest:
                sb.set_pending(row["id"])
                print(f"  reingest {slug:28} {trigger_ingest(row['id'])}")
            else:
                print(f"  skip     {slug:28} already seeded ({row['status']})")
            continue

        document_id = str(uuid.uuid4())
        storage_path = f"{owner_id}/{document_id}/{doc['filename']}"
        sb.upload(storage_path, (FILES / doc["filename"]).read_bytes(), "application/pdf")
        try:
            sb.insert_document(
                {
                    "id": document_id,
                    "owner_id": owner_id,
                    "title": doc["title"],
                    "storage_path": storage_path,
                    "mime_type": "application/pdf",
                    "content_type": doc["content_type"],
                    "industry": doc["industry"],
                    "published_at": doc["published_at"],
                    "source_url": doc["url"],
                    "external_ref": slug,
                    "status": "pending",
                }
            )
        except httpx.HTTPError:
            sb.delete_object(storage_path)
            raise
        print(f"  seeded   {slug:28} {trigger_ingest(document_id)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
