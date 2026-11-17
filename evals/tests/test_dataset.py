import json

import pytest

from asset_evals import dataset

MANIFEST = dataset.DATASET.parent.parent / "sample-corpus" / "manifest.json"


def test_real_dataset_shape():
    rows = dataset.load()
    answerable = [r for r in rows if r["answerable"]]
    assert len(answerable) == 30
    assert len(rows) - len(answerable) == 5
    slugs = {d["slug"]: d for d in json.loads(MANIFEST.read_text())["documents"]}
    for r in answerable:
        for e in r["expected"]:
            assert e["external_ref"] in slugs, e
            assert all(1 <= p <= slugs[e["external_ref"]]["pages"] for p in e["pages"]), r["id"]


def test_validation(tmp_path):
    bad = tmp_path / "d.jsonl"
    bad.write_text(json.dumps({"id": "a", "question": "?", "expected": [], "answerable": True}) + "\n")
    with pytest.raises(ValueError):
        dataset.load(bad)
