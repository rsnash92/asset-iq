import pytest

from asset_ingest.errors import ScannedDocumentError, UnsupportedFileError
from asset_ingest.extract import assert_has_text, extract_pages

LONG = "Employers must assess the risks to contractors working on site. " * 6


def test_extracts_text_per_page(pdf_factory):
    data = pdf_factory([f"Page one. {LONG}", f"Page two. {LONG}", "Page three. " + LONG])
    pages = extract_pages(data, "application/pdf")
    assert len(pages) == 3
    assert pages[0].startswith("Page one.")
    assert "Page two." in pages[1]
    assert "Page three." in pages[2]
    assert_has_text(pages)


def test_blank_pdf_is_flagged_as_scanned(pdf_factory):
    pages = extract_pages(pdf_factory(["", "", ""]), "application/pdf")
    assert pages == ["", "", ""]
    with pytest.raises(ScannedDocumentError) as err:
        assert_has_text(pages)
    assert "scanned" in err.value.user_message


def test_low_text_density_is_flagged():
    with pytest.raises(ScannedDocumentError):
        assert_has_text(["x" * 250] + [""] * 50)


def test_markdown_is_single_page():
    pages = extract_pages(b"# Title\n\nSome markdown text.", "text/markdown")
    assert pages == ["# Title\n\nSome markdown text."]


def test_pdf_detected_by_magic_even_if_mime_wrong(pdf_factory):
    pages = extract_pages(pdf_factory([LONG]), "application/octet-stream")
    assert len(pages) == 1


def test_unsupported_type():
    with pytest.raises(UnsupportedFileError):
        extract_pages(b"\x00\x01", "image/png")


def test_corrupt_pdf():
    with pytest.raises(UnsupportedFileError):
        extract_pages(b"%PDF-1.4 garbage", "application/pdf")
