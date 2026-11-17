"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiError, CONTENT_TYPE_LABELS, formatDate, titleCase } from "@/lib/labels";

export interface DocRow {
  id: string;
  title: string;
  content_type: string;
  industry: string | null;
  published_at: string | null;
  page_count: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
}

const STATUS_VARIANT = { ready: "default", failed: "destructive", pending: "secondary", processing: "secondary" } as const;

export function DocumentsTable({ initial }: { initial: DocRow[] }) {
  const [docs, setDocs] = useState(initial);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [industry, setIndustry] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // re-sync when the server component re-renders with fresh rows (router.refresh after upload)
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setDocs(initial);
  }

  // Poll while anything is still being ingested.
  const inFlight = docs.some((d) => d.status === "pending" || d.status === "processing");
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/documents", { cache: "no-store" });
      if (res.ok) setDocs(((await res.json()) as { documents: DocRow[] }).documents);
    }, 3000);
    return () => clearInterval(t);
  }, [inFlight]);

  const industries = useMemo(() => [...new Set(docs.map((d) => d.industry).filter(Boolean))].sort() as string[], [docs]);
  const shown = docs.filter(
    (d) =>
      (!q || d.title.toLowerCase().includes(q.toLowerCase())) &&
      (!type || d.content_type === type) &&
      (!industry || d.industry === industry),
  );

  async function act(id: string, kind: "delete" | "reingest") {
    if (kind === "delete" && !window.confirm("Delete this document and its index? This can't be undone.")) return;
    setBusyId(id);
    setError("");
    const res = await fetch(kind === "delete" ? `/api/documents/${id}` : `/api/documents/${id}/reingest`, {
      method: kind === "delete" ? "DELETE" : "POST",
    });
    setBusyId(null);
    if (!res.ok) return setError(await apiError(res));
    setDocs((prev) => (kind === "delete" ? prev.filter((d) => d.id !== id) : prev.map((d) => (d.id === id ? { ...d, status: "pending", error: null } : d))));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-lg border bg-transparent px-2.5 text-sm" aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(CONTENT_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-8 rounded-lg border bg-transparent px-2.5 text-sm" aria-label="Filter by industry">
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {titleCase(i)}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-sm text-muted-foreground">
          {shown.length} of {docs.length} documents
        </span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead className="text-right">Pages</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {docs.length === 0 ? "No documents yet — upload one above, or run the seed script." : "No documents match these filters."}
                </TableCell>
              </TableRow>
            )}
            {shown.map((d) => (
              <TableRow key={d.id} data-testid="doc-row">
                <TableCell className="max-w-sm truncate font-medium">
                  {d.status === "ready" ? <Link href={`/documents/${d.id}`} className="hover:underline">{d.title}</Link> : d.title}
                </TableCell>
                <TableCell>{CONTENT_TYPE_LABELS[d.content_type] ?? d.content_type}</TableCell>
                <TableCell>{titleCase(d.industry)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.page_count ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[d.status]} title={d.error ?? undefined} data-testid="doc-status">
                    {d.status}
                  </Badge>
                  {d.status === "failed" && d.error && <p className="mt-1 max-w-56 text-xs whitespace-normal text-destructive">{d.error}</p>}
                </TableCell>
                <TableCell>{formatDate(d.published_at)}</TableCell>
                <TableCell>{formatDate(d.created_at)}</TableCell>
                <TableCell className="space-x-1 text-right whitespace-nowrap">
                  {(d.status === "failed" || d.status === "ready") && (
                    <Button size="xs" variant="ghost" disabled={busyId === d.id} onClick={() => act(d.id, "reingest")}>
                      Re-index
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" disabled={busyId === d.id} onClick={() => act(d.id, "delete")}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
