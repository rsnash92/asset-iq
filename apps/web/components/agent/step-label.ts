/** Human-readable progress line for an agent tool call. Pure — unit tested. */
type Any = Record<string, unknown> | undefined;

export function stepLabel(tool: string, state: string, input: Any, output: Any, titles: Map<string, string>): string {
  const done = state === "output-available";
  const failed = state === "output-error" || Boolean(output && "error" in output);
  const docTitle = (id: unknown) => (typeof id === "string" ? titles.get(id) : undefined) ?? (output?.title as string | undefined) ?? "document";
  const pages = input?.pages as { from: number; to: number } | undefined;
  const range = pages ? (pages.from === pages.to ? ` p. ${pages.from}` : ` pp. ${pages.from}–${pages.to}`) : "";
  let label: string;
  switch (tool) {
    case "search_library":
      label = done
        ? `Searched library for “${String(input?.query ?? "")}” — ${(output?.results as unknown[] | undefined)?.length ?? 0} passages`
        : `Searching library for “${String(input?.query ?? "…")}”…`;
      break;
    case "list_assets": {
      const scope = [input?.content_type, input?.industry].filter(Boolean).join(", ");
      label = done
        ? `Listed ${(output?.documents as unknown[] | undefined)?.length ?? 0} documents${scope ? ` (${scope})` : ""}`
        : `Listing documents${scope ? ` (${scope})` : ""}…`;
      break;
    }
    case "get_document":
      label = done ? `Read “${docTitle(input?.document_id)}”${range}` : `Reading “${docTitle(input?.document_id)}”${range}…`;
      break;
    case "summarise_document":
      label = done
        ? `Summarised “${docTitle(input?.document_id)}” for ${String(input?.audience ?? "a general reader")}`
        : `Summarising “${docTitle(input?.document_id)}”…`;
      break;
    case "draft_content":
      label = done ? `Drafted ${String(input?.format ?? "content").replace(/_/g, " ")}` : `Drafting ${String(input?.format ?? "content").replace(/_/g, " ")}…`;
      break;
    default:
      label = done ? `Ran ${tool}` : `Running ${tool}…`;
  }
  return failed ? `${label} — failed${output?.error ? `: ${String(output.error)}` : ""}` : label;
}

/** Collect document_id → title from every tool output seen so far. */
export function collectTitles(outputs: unknown[]): Map<string, string> {
  const m = new Map<string, string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.document_id === "string" && typeof o.title === "string") m.set(o.document_id, o.title);
      Object.values(o).forEach(visit);
    }
  };
  outputs.forEach(visit);
  return m;
}
