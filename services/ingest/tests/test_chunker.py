import pytest

from asset_ingest.chunker import build_units, chunk_pages, count_tokens, split_sentences
from asset_ingest.text import normalise_page


def sentence(i: int, words: int = 12) -> str:
    return f"Sentence number {i} " + " ".join(f"word{i}x{j}" for j in range(words)) + "."


def page_of(n_sentences: int, start: int = 0, para_every: int = 4) -> str:
    out = []
    for i in range(start, start + n_sentences):
        out.append(sentence(i))
        out.append("\n\n" if (i + 1) % para_every == 0 else " ")
    return "".join(out)


# --- normalisation -------------------------------------------------------------


def test_dehyphenates_line_breaks_and_joins_lines():
    assert normalise_page("Contractor safe-\nty is\nimportant.") == ["Contractor safety is important."]


def test_keeps_real_hyphens_and_splits_paragraphs():
    paras = normalise_page("Well-being matters.\n\n\nSecond   para.")
    assert paras == ["Well-being matters.", "Second para."]


def test_sentence_split_handles_quotes_and_bullets():
    parts = split_sentences('He said "Stop." Then left. • First item • Second item')
    assert parts == ['He said "Stop."', "Then left.", "• First item", "• Second item"]


def test_sentence_split_does_not_split_decimals():
    assert split_sentences("The limit is 2.5 metres. Next.") == ["The limit is 2.5 metres.", "Next."]


# --- size and boundaries -------------------------------------------------------


def test_short_document_is_single_chunk():
    chunks = chunk_pages(["One short sentence. Another one."])
    assert len(chunks) == 1
    assert chunks[0].page_start == chunks[0].page_end == 1
    assert chunks[0].content == "One short sentence. Another one."


def test_no_chunk_exceeds_max_tokens():
    pages = [page_of(60, start=p * 60) for p in range(4)]
    chunks = chunk_pages(pages, max_tokens=500, overlap_tokens=75)
    assert len(chunks) > 3
    assert all(c.token_count <= 500 for c in chunks)
    assert all(c.token_count == count_tokens(c.content) for c in chunks)


def test_chunks_are_mostly_full():
    chunks = chunk_pages([page_of(200)], max_tokens=500, overlap_tokens=75)
    assert all(c.token_count > 350 for c in chunks[:-1])


def test_chunks_end_on_sentence_boundaries():
    chunks = chunk_pages([page_of(120)], max_tokens=200, overlap_tokens=40)
    for c in chunks:
        assert c.content.endswith("."), c.content[-40:]
        assert c.content.startswith("Sentence number")


def test_every_sentence_is_kept():
    text = page_of(80)
    chunks = chunk_pages([text], max_tokens=150, overlap_tokens=30)
    joined = " ".join(c.content for c in chunks)
    for i in range(80):
        assert f"Sentence number {i} " in joined


# --- overlap ------------------------------------------------------------------


def test_consecutive_chunks_overlap_with_whole_sentences():
    chunks = chunk_pages([page_of(100)], max_tokens=200, overlap_tokens=60)
    for a, b in zip(chunks, chunks[1:], strict=False):
        first_sentence_of_b = split_sentences(b.content.split("\n\n")[0])[0]
        assert first_sentence_of_b in a.content, "next chunk should start with tail of previous"


def test_overlap_never_exceeds_budget():
    chunks = chunk_pages([page_of(100)], max_tokens=200, overlap_tokens=60)
    for a, b in zip(chunks, chunks[1:], strict=False):
        a_sents = split_sentences(a.content.replace("\n\n", " "))
        b_sents = split_sentences(b.content.replace("\n\n", " "))
        shared = [s for s in b_sents if s in a_sents]
        assert sum(count_tokens(s) for s in shared) <= 60


def test_zero_overlap():
    chunks = chunk_pages([page_of(100)], max_tokens=200, overlap_tokens=0)
    seen: set[str] = set()
    for c in chunks:
        sents = set(split_sentences(c.content.replace("\n\n", " ")))
        assert not (sents & seen)
        seen |= sents


def test_overlap_must_be_smaller_than_max():
    with pytest.raises(ValueError):
        chunk_pages(["x."], max_tokens=50, overlap_tokens=50)


# --- page tracking -------------------------------------------------------------


def test_page_numbers_are_one_based_and_monotonic():
    pages = [page_of(30, start=p * 30) for p in range(5)]
    chunks = chunk_pages(pages, max_tokens=200, overlap_tokens=40)
    assert chunks[0].page_start == 1
    assert chunks[-1].page_end == 5
    for a, b in zip(chunks, chunks[1:], strict=False):
        assert b.page_start >= a.page_start
    for c in chunks:
        assert 1 <= c.page_start <= c.page_end <= 5


def test_chunk_spanning_page_break_cites_both_pages():
    pages = ["Page one sentence. Another on page one.", "Page two sentence here."]
    chunks = chunk_pages(pages)
    assert len(chunks) == 1
    assert (chunks[0].page_start, chunks[0].page_end) == (1, 2)


def test_page_attribution_matches_content():
    pages = [page_of(30, start=p * 30) for p in range(3)]
    chunks = chunk_pages(pages, max_tokens=150, overlap_tokens=0)
    for c in chunks:
        nums = [int(s.split()[2]) for s in split_sentences(c.content.replace("\n\n", " "))]
        expected_pages = {n // 30 + 1 for n in nums}
        assert min(expected_pages) == c.page_start
        assert max(expected_pages) == c.page_end


def test_empty_pages_are_skipped_but_numbering_preserved():
    chunks = chunk_pages(["", "   \n  ", "Only page three has text."])
    assert len(chunks) == 1
    assert chunks[0].page_start == chunks[0].page_end == 3


def test_all_empty_returns_no_chunks():
    assert chunk_pages(["", ""]) == []


# --- oversize sentences ---------------------------------------------------------


def test_oversize_sentence_is_hard_split():
    giant = " ".join(f"token{i}" for i in range(1500)) + "."
    chunks = chunk_pages([f"Intro sentence. {giant} Outro sentence."], max_tokens=300, overlap_tokens=50)
    assert all(c.token_count <= 300 for c in chunks)
    joined = "".join(c.content for c in chunks)
    assert "token0" in joined and "token1499" in joined
    assert "Outro sentence." in chunks[-1].content


def test_units_flag_paragraph_starts():
    units = build_units(["First para one. First para two.\n\nSecond para."], max_tokens=500)
    assert [u.starts_paragraph for u in units] == [True, False, True]


def test_paragraph_breaks_preserved_in_content():
    chunks = chunk_pages(["Alpha one. Alpha two.\n\nBeta one."])
    assert chunks[0].content == "Alpha one. Alpha two.\n\nBeta one."
