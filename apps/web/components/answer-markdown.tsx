"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface CitationTarget {
  n?: number;
  documentId: string;
  title: string;
  page: number;
  pageLabel: string;
  chunkId?: string;
}

/**
 * Renders model Markdown and turns citations into chips that open the source at
 * the cited page:
 *   - chat answers use numbered refs "[3]" (resolved against the excerpt list)
 *   - agent output uses "[cite:<document_id>:p<page>]" tokens (resolved by id)
 */
export function AnswerMarkdown({
  text,
  numbered,
  titles,
}: {
  text: string;
  numbered?: Map<number, CitationTarget>;
  titles?: Map<string, string>;
}) {
  const withLinks = text
    .replace(/\[cite:([0-9a-f-]{36}):p(\d+)\]/g, (_, id: string, p: string) => ` [↗](#doc:${id}:${p})`)
    .replace(/\[(\d{1,3})\](?!\()/g, (m, n: string) => (numbered?.has(Number(n)) ? `[${n}](#cite:${n})` : m));

  return (
    <div className="prose prose-sm max-w-none space-y-2 dark:prose-invert [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#cite:")) {
              const t = numbered?.get(Number(href.slice(6)));
              if (!t) return <>{children}</>;
              return <CitationChip target={t} label={String(t.n)} />;
            }
            if (href?.startsWith("#doc:")) {
              const [, id, page] = href.split(":");
              const title = titles?.get(id!) ?? "Source";
              return <CitationChip target={{ documentId: id!, title, page: Number(page), pageLabel: `p. ${page}` }} label={`${shorten(title)}, p. ${page}`} />;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="underline">
                {children}
              </a>
            );
          },
        }}
      >
        {withLinks}
      </ReactMarkdown>
    </div>
  );
}

function shorten(s: string) {
  return s.length > 28 ? `${s.slice(0, 26)}…` : s;
}

export function CitationChip({ target, label }: { target: CitationTarget; label: string }) {
  const qs = new URLSearchParams({ page: String(target.page), ...(target.chunkId ? { chunk: target.chunkId } : {}) });
  return (
    <Link
      href={`/documents/${target.documentId}?${qs}`}
      target="_blank"
      title={`${target.title} — ${target.pageLabel}`}
      className="mx-0.5 inline-flex items-center rounded-md border bg-muted px-1.5 py-0 align-baseline text-[0.7rem] font-medium no-underline hover:bg-primary hover:text-primary-foreground"
      data-testid="citation-chip"
    >
      {label}
    </Link>
  );
}
