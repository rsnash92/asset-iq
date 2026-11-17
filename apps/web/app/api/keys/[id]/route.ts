import { AppError } from "@asset-iq/core";
import { requireUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db, userId } = await requireUser(req);
    const { error } = await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("owner_id", userId);
    if (error) throw new AppError("internal", error.message);
    return json({ revoked: id });
  } catch (e) {
    return errorResponse(e);
  }
}
