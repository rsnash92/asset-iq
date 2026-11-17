import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { findExcerpt } from "@/lib/highlight";
import { CONTENT_TYPE_LABELS, formatDate, titleCase } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; chunk?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id,title,storage_path,mime_type,content_type,industry,published_at,page_count,status,source_url")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const [{ data: signed }, { data: cited }, { data: pageChunks }] = await Promise.all([
    supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600),
    sp.chunk
      ? supabase.from("chunks").select("id,content,page_start,page_end").eq("id", sp.chunk).eq("document_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("chunks")
      .select("id,chunk_index,content,page_start,page_end")
      .eq("document_id", id)
      .lte("page_start", page)
      .gte("page_end", page)
      .order("chunk_index")
      .limit(6),
  ]);

  const isPdf = doc.mime_type === "application/pdf";
  let text: string | null = null;
  if (!isPdf && signed?.signedUrl) {
    const res = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(10_000) });
    text = res.ok ? await res.text() : null;
  }
  const range = text && cited ? findExcerpt(text, cited.content) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/library" className="text-sm text-muted-foreground hover:underline">
            ← Library
          </Link>
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{CONTENT_TYPE_LABELS[doc.content_type]}</Badge>
            <span>{titleCase(doc.industry)}</span>·<span>{formatDate(doc.published_at)}</span>·<span>{doc.page_count ?? "?"} pages</span>
            {doc.source_url && (
              <>
                ·
                <a href={doc.source_url} className="underline" target="_blank" rel="noreferrer">
                  original source
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-h-[75vh] overflow-hidden rounded-lg border">
          {isPdf && signed?.signedUrl ? (
            // Native viewer with a page anchor — robust, zero JS. pdf.js would allow in-page highlights (see DECISIONS.md).
            <iframe key={page} title={doc.title} src={`${signed.signedUrl}#page=${page}`} className="h-[75vh] w-full" data-testid="pdf-viewer" />
          ) : text !== null ? (
            <pre className="h-[75vh] overflow-auto p-4 text-sm whitespace-pre-wrap">
              {range ? (
                <>
                  {text.slice(0, range[0])}
                  <mark id="cited" className="rounded bg-yellow-200 dark:bg-yellow-700">
                    {text.slice(range[0], range[1])}
                  </mark>
                  {text.slice(range[1])}
                </>
              ) : (
                text
              )}
            </pre>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Couldn&apos;t load the file.</p>
          )}
        </div>

        <aside className="space-y-3">
          {cited ? (
            <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-3 dark:bg-yellow-950" data-testid="cited-excerpt">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-yellow-800 dark:text-yellow-200">
                Cited excerpt · {cited.page_start === cited.page_end ? `p. ${cited.page_start}` : `pp. ${cited.page_start}–${cited.page_end}`}
              </p>
              <p className="text-sm whitespace-pre-wrap">{cited.content}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Open a citation from Chat or Agent to see the exact excerpt here.</p>
          )}
          {isPdf && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Indexed text on p. {page}</span>
                <span className="space-x-2">
                  {page > 1 && <Link href={`?page=${page - 1}`} className="underline">prev</Link>}
                  {(!doc.page_count || page < doc.page_count) && <Link href={`?page=${page + 1}`} className="underline">next</Link>}
                </span>
              </div>
              {(pageChunks ?? []).map((c) => (
                <p key={c.id} className={`rounded border p-2 text-xs whitespace-pre-wrap ${c.id === sp.chunk ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-950" : ""}`}>
                  {c.content.slice(0, 600)}
                  {c.content.length > 600 && "…"}
                </p>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
