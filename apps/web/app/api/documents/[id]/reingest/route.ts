import { AppError } from "@asset-iq/core";
import { requireUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { triggerIngest } from "@/lib/ingest";

export const runtime = "nodejs";

/** Re-run ingestion (idempotent: the service replaces all chunks atomically). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db, userId } = await requireUser(req);
    const { data, error } = await db
      .from("documents")
      .update({ status: "pending", error: null })
      .eq("id", id)
      .eq("owner_id", userId)
      .neq("status", "processing")
      .select("id,status")
      .maybeSingle();
    if (error) throw new AppError("internal", error.message);
    if (!data) throw new AppError("invalid_input", "not found or already processing", { userMessage: "That document is already being processed." });
    return json({ document: data, triggered: await triggerIngest(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
