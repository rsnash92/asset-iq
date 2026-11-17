import { AppError, env, MongoAtlasStore } from "@asset-iq/core";
import { requireUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

/** Delete a document: storage object + row (chunks cascade) + Mongo mirror if configured. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db, userId } = await requireUser(req);
    const { data: doc, error } = await db.from("documents").select("id,storage_path").eq("id", id).eq("owner_id", userId).maybeSingle();
    if (error) throw new AppError("internal", error.message);
    if (!doc) throw new AppError("not_found", "document not found");

    const { error: delErr } = await db.from("documents").delete().eq("id", id).eq("owner_id", userId);
    if (delErr) throw new AppError("internal", delErr.message);

    const { error: storageErr } = await db.storage.from("documents").remove([doc.storage_path]);
    if (storageErr) console.warn("[documents] storage cleanup failed:", storageErr.message);

    if (env().MONGODB_URI) {
      await new MongoAtlasStore().deleteByDocument(id).catch((e: Error) => console.warn("[documents] mongo cleanup failed:", e.message));
    }
    return json({ deleted: id });
  } catch (e) {
    return errorResponse(e);
  }
}
