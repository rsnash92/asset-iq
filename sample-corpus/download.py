"""Download the sample corpus PDFs listed in manifest.json into ./files (gitignored).

    uv run python download.py            # skip files already present
    uv run python download.py --force    # re-download everything

Checks every response really is a PDF (content-type + %PDF magic) and records
sha256 checksums in files/checksums.json. A checksum that differs from the one
pinned in the manifest is reported (HSE occasionally revises a publication — the
eval dataset's page numbers were authored against the pinned version).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import httpx

HERE = Path(__file__).parent
FILES = HERE / "files"
USER_AGENT = "asset-iq-sample-corpus/0.1 (portfolio project; polite single-threaded downloader)"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", help="comma-separated slugs")
    args = parser.parse_args()

    manifest = json.loads((HERE / "manifest.json").read_text())
    docs = manifest["documents"]
    if args.only:
        wanted = set(args.only.split(","))
        docs = [d for d in docs if d["slug"] in wanted]

    FILES.mkdir(exist_ok=True)
    checksums_path = FILES / "checksums.json"
    checksums = json.loads(checksums_path.read_text()) if checksums_path.exists() else {}
    failures, drifted = [], []

    with httpx.Client(follow_redirects=True, timeout=60, headers={"User-Agent": USER_AGENT}) as client:
        for doc in docs:
            target = FILES / doc["filename"]
            if target.exists() and not args.force:
                data = target.read_bytes()
                status = "cached"
            else:
                try:
                    resp = client.get(doc["url"])
                    resp.raise_for_status()
                except httpx.HTTPError as exc:
                    failures.append(doc["slug"])
                    print(f"  FAIL {doc['slug']}: {exc}")
                    continue
                data = resp.content
                ctype = resp.headers.get("content-type", "")
                if "pdf" not in ctype or not data.startswith(b"%PDF-"):
                    failures.append(doc["slug"])
                    print(f"  FAIL {doc['slug']}: not a PDF (content-type {ctype!r})")
                    continue
                target.write_bytes(data)
                status = "downloaded"
                time.sleep(0.5)  # be polite to hse.gov.uk
            digest = hashlib.sha256(data).hexdigest()
            checksums[doc["filename"]] = digest
            if doc.get("sha256") and doc["sha256"] != digest:
                drifted.append(doc["slug"])
            print(f"  {status:10} {doc['slug']:28} {len(data) / 1024:8.0f} KB")

    checksums_path.write_text(json.dumps(checksums, indent=2) + "\n")
    print(f"\n{len(docs) - len(failures)}/{len(docs)} files present in {FILES}")
    if drifted:
        print(f"WARNING: content changed upstream since the manifest was pinned: {', '.join(drifted)}")
        print("         eval page numbers for these documents may need re-checking.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
