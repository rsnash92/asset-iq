import { AppError } from "@asset-iq/core";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, parseJson } from "@/lib/http";
import { triggerIngest } from "@/lib/ingest";
import { ALLOWED_FILES, fileKind, MAX_UPLOAD_BYTES, UploadCompleteSchema } from "@/lib/uploads";

export const runtime = "nodejs";

/** Step 2 of upload: verify the stored object, create the documents row, trigger ingestion. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db, userId } = await requireUser(req);
    const body = await parseJson(req, UploadCompleteSchema);

    const prefix = `${userId}/${id}/`;
    const fileName = body.path.slice(prefix.length);
    if (!body.path.startsWith(prefix) || !fileName || fileName.includes("/")) {
      throw new AppError("forbidden", "path does not belong to this document");
    }
    const kind = fileKind(fileName);
    if (!kind) throw new AppError("invalid_input", "unsupported file type");

    // the object must exist and be within limits
    const { data: objects, error: listErr } = await db.storage.from("documents").list(`${userId}/${id}`);
    if (listErr) throw new AppError("internal", listErr.message);
    const obj = objects?.find((o) => o.name === fileName);
    if (!obj) throw new AppError("invalid_input", "file not uploaded", { userMessage: "The upload didn't complete. Please try again." });
    const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
    if (size > MAX_UPLOAD_BYTES) throw new AppError("invalid_input", "file too large", { userMessage: "Files must be 20 MB or smaller." });

    // content sniffing: a ".pdf" must actually start with %PDF
    if (kind === "pdf") {
      const { data: signed } = await db.storage.from("documents").createSignedUrl(body.path, 60);
      if (signed?.signedUrl) {
        const head = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-4" }, signal: AbortSignal.timeout(10_000) });
        const magic = new TextDecoder().decode(new Uint8Array(await head.arrayBuffer()).slice(0, 5));
        if (!magic.startsWith("%PDF")) {
          await db.storage.from("documents").remove([body.path]);
          throw new AppError("invalid_input", "not a pdf", { userMessage: "That file isn't a valid PDF." });
        }
      }
    }

    const { data: doc, error } = await db
      .from("documents")
      .insert({
        id,
        owner_id: userId,
        title: body.title,
        storage_path: body.path,
        mime_type: ALLOWED_FILES[kind],
        content_type: body.contentType,
        industry: body.industry ?? null,
        published_at: body.publishedAt ?? null,
        status: "pending",
      })
      .select("id,title,status")
      .single();
    if (error) throw new AppError("internal", `insert document failed: ${error.message}`);

    const triggered = await triggerIngest(id);
    return json({ document: doc, triggered }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
