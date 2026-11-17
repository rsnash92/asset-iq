import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = { kind: string; queries: number; input_tokens: number; output_tokens: number; embedding_tokens: number; cost_usd: number; p50_latency_ms: number | null; p95_latency_ms: number | null; errors: number };

const usd = (n: number) => `$${Number(n).toFixed(4)}`;
const int = (n: number) => Number(n).toLocaleString("en-GB");

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = (await searchParams).days === "7" ? 7 : 30;
  const supabase = await createClient();
  const [{ data: summary }, { data: recent }] = await Promise.all([
    supabase.rpc("usage_summary", { p_days: days }),
    supabase
      .from("query_logs")
      .select("id,kind,query,model,input_tokens,output_tokens,cost_usd,latency_ms,error,created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  const rows = (summary ?? []) as Row[];
  const totals = rows.reduce(
    (t, r) => ({ queries: t.queries + Number(r.queries), tokens: t.tokens + Number(r.input_tokens) + Number(r.output_tokens), cost: t.cost + Number(r.cost_usd) }),
    { queries: 0, tokens: 0, cost: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Usage</h1>
          <p className="text-sm text-muted-foreground">Every chat, agent and search request is logged with tokens, cost and latency.</p>
        </div>
        <div className="flex gap-1 text-sm">
          {[7, 30].map((d) => (
            <a key={d} href={`?days=${d}`} className={`rounded-md px-2.5 py-1 ${d === days ? "bg-muted font-medium" : "text-muted-foreground"}`}>
              Last {d} days
            </a>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Queries", int(totals.queries)],
          ["LLM tokens", int(totals.tokens)],
          ["Cost", usd(totals.cost)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">{k}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{v}</CardContent>
          </Card>
        ))}
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Queries</TableHead>
              <TableHead className="text-right">Input tok</TableHead>
              <TableHead className="text-right">Output tok</TableHead>
              <TableHead className="text-right">Embed tok</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">p50 ms</TableHead>
              <TableHead className="text-right">p95 ms</TableHead>
              <TableHead className="text-right">Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No usage in this period.</TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.kind}>
                <TableCell className="font-medium">{r.kind}</TableCell>
                <TableCell className="text-right tabular-nums">{int(r.queries)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(r.input_tokens)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(r.output_tokens)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(r.embedding_tokens)}</TableCell>
                <TableCell className="text-right tabular-nums">{usd(r.cost_usd)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.p50_latency_ms == null ? "—" : Math.round(r.p50_latency_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.p95_latency_ms == null ? "—" : Math.round(r.p95_latency_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(r.errors)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-2">
        <h2 className="font-medium">Recent requests</h2>
        <div className="rounded-lg border">
          <Table>
            <TableBody>
              {(recent ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="w-20 text-muted-foreground">{r.kind}</TableCell>
                  <TableCell className="max-w-md truncate">{r.query}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.latency_ms ?? "—"} ms</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(Number(r.cost_usd ?? 0))}</TableCell>
                  <TableCell className="max-w-40 truncate text-destructive">{r.error ?? ""}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
