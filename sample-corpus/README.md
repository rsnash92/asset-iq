# Sample corpus

38 public UK Health and Safety Executive publications (752 pages) re-used under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

> Contains public sector information published by the Health and Safety Executive and licensed under the Open Government Licence.

Only [`manifest.json`](./manifest.json) is committed — the PDFs are downloaded on demand into `files/` (gitignored).
Each manifest entry records title, URL, licence, licence evidence, content type, industry, publication date
(and its precision), page count and the sha256 of the version the eval dataset was authored against.

```bash
uv run python download.py                 # fetch PDFs into ./files (checks %PDF magic + checksums)
uv run python seed.py --limit 5           # Phase 1: first five documents for the demo user
uv run python seed.py                     # everything (idempotent; --reingest to re-process)
```

`seed.py` reads `../.env`: `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`DEMO_USER_EMAIL` (default `demo@asset-iq.local`), `DEMO_USER_PASSWORD`, and optionally
`INGEST_SERVICE_URL` + `INGEST_SHARED_SECRET` to trigger ingestion immediately (otherwise the
ingest service's polling worker picks documents up).

Licence verification (2026-11-17) is described in `manifest.json → licence_verification` and in
[`docs/DECISIONS.md`](../docs/DECISIONS.md).
