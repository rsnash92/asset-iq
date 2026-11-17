import "server-only";

/**
 * Nudge the ingestion service to process a document now. Best-effort: if the
 * service is down or slow, the document stays `pending` and the service's
 * polling worker picks it up — upload never fails because ingest is busy.
 */
export async function triggerIngest(documentId: string): Promise<boolean> {
  const url = process.env.INGEST_SERVICE_URL;
  const secret = process.env.INGEST_SHARED_SECRET;
  if (!url || !secret) return false;
  try {
    const res = await fetch(new URL("/ingest", url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ document_id: documentId }),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch (e) {
    console.warn("[ingest] trigger failed; worker will pick it up:", (e as Error).message);
    return false;
  }
}
