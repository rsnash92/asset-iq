import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const RunSchema = z.object({
  config: z.string(),
  backend: z.string(),
  mode: z.string(),
  rerank: z.boolean(),
  k: z.number(),
  n_questions: z.number(),
  retrieval: z.object({ hit_at_5: z.number(), doc_hit_at_5: z.number(), mrr: z.number() }),
  answer: z.object({ faithfulness: z.number(), citation_correctness: z.number(), refusal_accuracy: z.number() }).nullable(),
  cost_usd: z.number().nullable().optional(),
  latency_ms_p50: z.number().nullable().optional(),
  latency_ms_p95: z.number().nullable().optional(),
  run_file: z.string().optional(),
});
export const LatestSchema = z.object({ generated_at: z.string(), runs: z.array(RunSchema) });
export type LatestEvals = z.infer<typeof LatestSchema>;

/** Results are committed to evals/results/latest.json by the Python runner. */
export async function loadLatestEvals(): Promise<LatestEvals | null> {
  const candidates = [
    path.join(process.cwd(), "../../evals/results/latest.json"),
    path.join(process.cwd(), "evals/results/latest.json"),
  ];
  for (const p of candidates) {
    try {
      return LatestSchema.parse(JSON.parse(await readFile(p, "utf8")));
    } catch {
      // try next
    }
  }
  return null;
}
