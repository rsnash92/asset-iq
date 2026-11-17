"""Typed ingestion errors. `user_message` is safe to store in documents.error."""


class IngestError(Exception):
    user_message = "Ingestion failed unexpectedly. Check the ingest service logs."


class ScannedDocumentError(IngestError):
    user_message = (
        "No extractable text — this looks like a scanned or image-only PDF. OCR isn't supported yet."
    )


class UnsupportedFileError(IngestError):
    user_message = "Unsupported file type. Upload a text-based PDF, Markdown or plain-text file."


class StorageError(IngestError):
    user_message = "Couldn't read the uploaded file from storage."


class EmbeddingError(IngestError):
    user_message = "The embedding provider failed after several retries. Re-ingest to try again."


class DatabaseError(IngestError):
    user_message = "Couldn't save the document's chunks. Re-ingest to try again."


class EmbeddingConfigError(EmbeddingError):
    user_message = "The ingest service has no embedding API key configured. Set OPENAI_API_KEY and re-ingest."
