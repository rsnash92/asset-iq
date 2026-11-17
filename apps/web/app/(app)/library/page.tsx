import { createClient } from "@/lib/supabase/server";
import { DocumentsTable, type DocRow } from "@/components/library/documents-table";
import { UploadForm } from "@/components/library/upload-form";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id,title,content_type,industry,published_at,page_count,status,error,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Library</h1>
        <p className="text-sm text-muted-foreground">Upload PDFs, Markdown or text. Each file is chunked, embedded and indexed for search.</p>
      </div>
      <UploadForm />
      <DocumentsTable initial={(data ?? []) as DocRow[]} />
    </div>
  );
}
