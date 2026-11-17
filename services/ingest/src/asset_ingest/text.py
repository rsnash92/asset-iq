"""Text normalisation for extracted PDF/Markdown text."""

import re

_HYPHEN_BREAK = re.compile(r"(?<=[a-z])-\n(?=[a-z])")
_INLINE_WS = re.compile(r"[ \t  -​]+")
_PARA_SPLIT = re.compile(r"\n\s*\n+")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def normalise_page(text: str) -> list[str]:
    """Return the paragraphs of one page, cleaned.

    - removes control characters
    - re-joins words hyphenated across line breaks ("safe-\\nty" -> "safety")
    - collapses single line breaks inside a paragraph into spaces
    - collapses runs of whitespace
    """
    text = _CONTROL.sub("", text.replace("\r\n", "\n").replace("\r", "\n"))
    text = _HYPHEN_BREAK.sub("", text)
    paragraphs = []
    for raw in _PARA_SPLIT.split(text):
        para = _INLINE_WS.sub(" ", raw.replace("\n", " ")).strip()
        if para:
            paragraphs.append(para)
    return paragraphs
