import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadLatestEvals } from "@/lib/evals";

export const dynamic = "force-dynamic";

const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const num = (n: number | null | undefined, d = 3) => (n == null ? "—" : n.toFixed(d));

export default async function EvalsPage() {
  const latest = await loadLatestEvals();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Evals</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          30 answerable questions with expected document + page, plus 5 unanswerable ones. Retrieval: hit@5 (page-level and document-level) and
          MRR. Answers: LLM-as-judge for faithfulness to the excerpts, citation correctness, and correct refusal. Run with{" "}
          <code className="rounded bg-muted px-1">evals/compare.sh</code>.
        </p>
      </div>
      {!latest ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">No eval results yet. Run the eval suite to populate this page.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Generated {new Date(latest.generated_at).toLocaleString("en-GB")}</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Config</TableHead>
                  <TableHead>Backend</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Rerank</TableHead>
                  <TableHead className="text-right">Hit@5 (page)</TableHead>
                  <TableHead className="text-right">Hit@5 (doc)</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Faithfulness</TableHead>
                  <TableHead className="text-right">Citations</TableHead>
                  <TableHead className="text-right">Refusals</TableHead>
                  <TableHead className="text-right">p50 ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.runs.map((r) => (
                  <TableRow key={r.config}>
                    <TableCell className="font-medium">{r.config}</TableCell>
                    <TableCell>{r.backend}</TableCell>
                    <TableCell>{r.mode}</TableCell>
                    <TableCell>{r.rerank ? "yes" : "no"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.retrieval.hit_at_5)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.retrieval.doc_hit_at_5)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.retrieval.mrr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.answer?.faithfulness)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.answer?.citation_correctness)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.answer?.refusal_accuracy)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.latency_ms_p50 ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
