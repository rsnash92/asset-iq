"""Service configuration, read from environment variables (never hard-coded)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = "http://127.0.0.1:55321"
    supabase_service_role_key: str = ""
    embedding_model: str = "nomic-ai/nomic-embed-text-v1.5"
    embedding_dimensions: int = 768
    embedding_cache_dir: str | None = None  # FASTEMBED_CACHE_PATH-style dir; baked into the image
    embedding_warmup: bool = True
    ingest_shared_secret: str = ""
    poll_interval_seconds: float = 5.0
    worker_enabled: bool = True
    max_concurrent_documents: int = 2

    chunk_max_tokens: int = 500
    chunk_overlap_tokens: int = 75
    embed_batch_size: int = 32
    http_timeout_seconds: float = 30.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
