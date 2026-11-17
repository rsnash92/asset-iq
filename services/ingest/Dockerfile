FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    TIKTOKEN_CACHE_DIR=/opt/tiktoken \
    EMBEDDING_CACHE_DIR=/opt/models

WORKDIR /app

# Dependencies first (cached layer), then the project itself.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev \
 && uv run --no-sync python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')" \
 && uv run --no-sync python -c "from fastembed import TextEmbedding; TextEmbedding('nomic-ai/nomic-embed-text-v1.5', cache_dir='/opt/models')"

RUN useradd --create-home --uid 10001 app && chown -R app /opt/tiktoken /opt/models
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["/app/.venv/bin/uvicorn", "asset_ingest.app:app", "--host", "0.0.0.0", "--port", "8000"]
