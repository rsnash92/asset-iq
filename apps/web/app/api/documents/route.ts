import { AppError } from "@asset-iq/core";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, parseJson } from "@/lib/http";
import { ALLOWED_FILES, fileKind, safeFileName, UploadInitSchema } from "@/lib/uploads";

export const runtime = "nodejs";

/** List the caller's documents (used for status polling). */
export async function GET(req: Request) {
  try {
    const { db, userId } = await requireUser(req);
    const { data, error } = await db
      .from("documents")
      .select("id,title,content_type,industry,published_at,page_count,status,error,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new AppError("internal", error.message);
    return json({ documents: data });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Step 1 of upload: validate the file and hand back a signed upload URL scoped to
 * "<owner>/<document_id>/<file>". The browser uploads straight to Storage (no 20 MB
 * body through the serverless function), then calls /api/documents/:id/complete.
 */
export async function POST(req: Request) {
  try {
    const { db, userId } = await requireUser(req);
    const body = await parseJson(req, UploadInitSchema);
    const kind = fileKind(body.fileName);
    if (!kind) {
      throw new AppError("invalid_input", "unsupported file type", { userMessage: "Only PDF, Markdown (.md) and text (.txt) files are supported." });
    }
    const documentId = randomUUID();
    const path = `${userId}/${documentId}/${safeFileName(body.fileName)}`;
    const { data, error } = await db.storage.from("documents").createSignedUploadUrl(path);
    if (error || !data) throw new AppError("internal", `signed upload url failed: ${error?.message}`);
    return json({ documentId, path, token: data.token, mimeType: ALLOWED_FILES[kind] });
  } catch (e) {
    return errorResponse(e);
  }
}
