"""Tiny .env loader so scripts work without extra dependencies (real env vars win)."""

import os
from pathlib import Path


def load_env(*candidates: Path) -> None:
    for path in candidates:
        if not path.is_file():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.split(" #", 1)[0].strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), value)
