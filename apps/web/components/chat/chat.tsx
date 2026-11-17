"use client";

import { useChat } from "@ai-sdk/react";
import type { Filters, ScoredChunk } from "@asset-iq/core/types";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import { AnswerMarkdown, CitationChip, type CitationTarget } from "@/components/answer-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatUIMessage, SourcesData } from "@/lib/chat-types";
import { apiError } from "@/lib/labels";
import { DebugPanel } from "./debug-panel";
import { FiltersPanel } from "./filters";

const EXAMPLES = [
  "What should a permit-to-work system include?",
  "How should we manage contractors on a shared site?",
  "What does the law require for working at height?",
];

function sourcesOf(m: ChatUIMessage): SourcesData | undefined {
  for (const p of m.parts) if (p.type === "data-sources") return p.data;
  return undefined;
}

export function Chat({ industries }: { industries: string[] }) {
  const [filters, setFilters] = useState<Filters>({});
  const [rerank, setRerank] = useState(false);
  const [mode, setMode] = useState<"chat" | "search">("chat");
  const [showDebug, setShowDebug] = useState(false);
  const [input, setInput] = useState("");
  const [searchResults, setSearchResults] = useState<ScoredChunk[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const transport = useMemo(() => new DefaultChatTransport<ChatUIMessage>({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat<ChatUIMessage>({ transport });
  const busy = status === "submitted" || status === "streaming";

  async function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    setInput("");
    if (mode === "chat") {
      await sendMessage({ text: q }, { body: { filters, rerank } });
      return;
    }
    setSearching(true);
    setSearchError("");
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q, filters, rerank, k: 10 }),
    });
    setSearching(false);
    if (!res.ok) return setSearchError(await apiError(res));
    setSearchResults(((await res.json()) as { results: ScoredChunk[] }).results);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-5">
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(["chat", "search"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`flex-1 rounded-md px-2 py-1 ${mode === m ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {m === "chat" ? "Chat" : "Search only"}
            </button>
          ))}
        </div>
        <FiltersPanel value={filters} onChange={setFilters} industries={industries} />
        <div className="space-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} /> Rerank (Cohere)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} /> Retrieval debug
          </label>
        </div>
        {messages.length > 0 && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setMessages([])}>
            New conversation
          </button>
        )}
      </aside>

      <section className="flex min-h-[70vh] flex-col">
        <div className="flex-1 space-y-6 pb-4">
          {mode === "search" ? (
            <SearchResults results={searchResults} showDebug={showDebug} error={searchError} />
          ) : messages.length === 0 ? (
            <div className="space-y-3 pt-10 text-center">
              <h1 className="text-xl font-semibold">Ask your library</h1>
              <p className="text-sm text-muted-foreground">Answers come only from your documents, with page-level citations.</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {EXAMPLES.map((e) => (
                  <Button key={e} variant="outline" size="sm" onClick={() => submit(e)}>
                    {e}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageView key={m.id} m={m} showDebug={showDebug} />)
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {friendly(error)}
            </p>
          )}
        </div>

        <form
          className="sticky bottom-0 flex gap-2 border-t bg-background pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            placeholder={mode === "chat" ? "Ask a question…" : "Search the library…"}
            className="min-h-11 resize-none"
            rows={1}
            aria-label="Question"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={() => stop()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || searching}>
              {mode === "chat" ? "Ask" : "Search"}
            </Button>
          )}
        </form>
      </section>
    </div>
  );
}

function friendly(error: Error) {
  try {
    const parsed = JSON.parse(error.message) as { error?: { message?: string } };
    return parsed.error?.message ?? error.message;
  } catch {
    return error.message || "Something went wrong.";
  }
}

function MessageView({ m, showDebug }: { m: ChatUIMessage; showDebug: boolean }) {
  const data = sourcesOf(m);
  const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
  if (m.role === "user") {
    return <div className="ml-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">{text}</div>;
  }
  const numbered = new Map<number, CitationTarget>(
    (data?.sources ?? []).map((s) => [
      s.n,
      { n: s.n, documentId: s.documentId, title: s.title, page: s.pageStart, pageLabel: s.pageStart === s.pageEnd ? `p. ${s.pageStart}` : `pp. ${s.pageStart}–${s.pageEnd}`, chunkId: s.chunkId },
    ]),
  );
  const cited = new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((x) => Number(x[1])));
  return (
    <div className="space-y-3" data-testid="assistant-message">
      {text ? <AnswerMarkdown text={text} numbered={numbered} /> : <p className="text-sm text-muted-foreground">Searching the library…</p>}
      {data && cited.size > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Sources:
          {[...numbered.values()]
            .filter((t) => cited.has(t.n!))
            .map((t) => (
              <CitationChip key={t.n} target={t} label={`[${t.n}] ${t.title.slice(0, 40)} · ${t.pageLabel}`} />
            ))}
        </div>
      )}
      {showDebug && data && <DebugPanel data={data} />}
    </div>
  );
}

function SearchResults({ results, showDebug, error }: { results: ScoredChunk[] | null; showDebug: boolean; error: string }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!results) return <p className="pt-10 text-center text-sm text-muted-foreground">Search returns ranked passages without generating an answer.</p>;
  if (results.length === 0) return <p className="text-sm text-muted-foreground">No matching passages.</p>;
  if (showDebug) {
    return (
      <DebugPanel
        data={{
          standaloneQuery: "",
          reranked: results.some((r) => r.rerankScore != null),
          backend: "",
          mode: "hybrid",
          timings: { embedMs: 0, searchMs: 0, rerankMs: 0 },
          sources: results.map((r, i) => ({ ...r, n: i + 1, chunkId: r.id })),
        }}
      />
    );
  }
  return (
    <ol className="space-y-3">
      {results.map((r, i) => (
        <li key={r.id} className="rounded-lg border p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-muted-foreground">{i + 1}.</span>
            <CitationChip
              target={{ documentId: r.documentId, title: r.title, page: r.pageStart, pageLabel: `p. ${r.pageStart}`, chunkId: r.id }}
              label={`${r.title} · p. ${r.pageStart}${r.pageEnd !== r.pageStart ? `–${r.pageEnd}` : ""}`}
            />
          </div>
          <p className="line-clamp-4 text-muted-foreground">{r.content}</p>
        </li>
      ))}
    </ol>
  );
}
