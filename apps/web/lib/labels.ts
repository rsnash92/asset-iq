export const CONTENT_TYPE_LABELS: Record<string, string> = {
  whitepaper: "Whitepaper",
  case_study: "Case study",
  webinar: "Webinar",
  ebook: "eBook",
  guide: "Guide",
  report: "Report",
  other: "Other",
};

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Read the friendly message from our API error envelope. */
export async function apiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
