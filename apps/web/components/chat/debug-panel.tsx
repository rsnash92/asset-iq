"use client";

import type { SourcesData } from "@/lib/chat-types";

const fmt = (n: number | null | undefined, d = 3) => (n == null ? "—" : n.toFixed(d));

/** Retrieval debug: every chunk with vector rank, keyword rank, fused (RRF) and rerank scores. */
export function DebugPanel({ data }: { data: SourcesData }) {
  return (
    <div className="space-y-2 text-xs" data-testid="debug-panel">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span>
          query: <span className="text-foreground">{data.standaloneQuery}</span>
        </span>
        <span>backend: {data.backend}</span>
        <span>mode: {data.mode}</span>
        <span>rerank: {data.reranked ? "on" : "off"}</span>
        <span>
          embed {data.timings.embedMs}ms · search {data.timings.searchMs}ms · rerank {data.timings.rerankMs}ms
        </span>
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-1.5">#</th>
              <th className="p-1.5">Document · pages</th>
              <th className="p-1.5 text-right">Vec rank</th>
              <th className="p-1.5 text-right">Vec score</th>
              <th className="p-1.5 text-right">KW rank</th>
              <th className="p-1.5 text-right">KW score</th>
              <th className="p-1.5 text-right">RRF</th>
              <th className="p-1.5 text-right">Rerank</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.chunkId} className="border-t align-top">
                <td className="p-1.5">{s.n}</td>
                <td className="p-1.5">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-muted-foreground">
                    pp. {s.pageStart}–{s.pageEnd} · {s.content.slice(0, 140)}…
                  </div>
                </td>
                <td className="p-1.5 text-right tabular-nums">{s.vectorRank ?? "—"}</td>
                <td className="p-1.5 text-right tabular-nums">{fmt(s.vectorScore)}</td>
                <td className="p-1.5 text-right tabular-nums">{s.keywordRank ?? "—"}</td>
                <td className="p-1.5 text-right tabular-nums">{fmt(s.keywordScore)}</td>
                <td className="p-1.5 text-right tabular-nums">{fmt(s.rrfScore, 4)}</td>
                <td className="p-1.5 text-right tabular-nums">{fmt(s.rerankScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
