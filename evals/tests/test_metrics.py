import pytest

from asset_evals import metrics

EXP = [{"external_ref": "indg368", "pages": [2]}, {"external_ref": "hsg159", "pages": [22, 23]}]


def r(ref, start, end=None):
    return {"externalRef": ref, "pageStart": start, "pageEnd": end or start}


def test_relevance_requires_doc_and_page_overlap():
    assert metrics.is_relevant(r("indg368", 2), EXP)
    assert metrics.is_relevant(r("indg368", 1, 3), EXP)  # range spans the expected page
    assert not metrics.is_relevant(r("indg368", 3), EXP)
    assert not metrics.is_relevant(r("other", 2), EXP)
    assert metrics.is_relevant(r("indg368", 3), EXP, page_level=False)


def test_hit_at_k_and_rank():
    results = [r("x", 1), r("indg368", 5), r("hsg159", 23), r("indg368", 2)]
    assert metrics.first_relevant_rank(results, EXP, 5) == 3
    assert metrics.hit_at_k(results, EXP, 5)
    assert not metrics.hit_at_k(results, EXP, 2)
    assert metrics.hit_at_k(results, EXP, 2, page_level=False)


def test_reciprocal_rank():
    results = [r("x", 1), r("hsg159", 22)]
    assert metrics.reciprocal_rank(results, EXP, 5) == 0.5
    assert metrics.reciprocal_rank([r("x", 1)], EXP, 5) == 0.0
    # relevant result beyond k does not count
    assert metrics.reciprocal_rank([r("x", 1)] * 5 + [r("indg368", 2)], EXP, 5) == 0.0


def test_empty_results():
    assert metrics.first_relevant_rank([], EXP, 5) is None


def test_mean_and_percentile():
    assert metrics.mean([]) is None
    assert metrics.mean([1, None, 3]) == 2
    assert metrics.percentile([10, 20, 30, 40], 50) == 25
    assert metrics.percentile([10, 20, 30, 40], 95) == pytest.approx(38.5)
    assert metrics.percentile([7], 95) == 7
    assert metrics.percentile([], 50) is None
