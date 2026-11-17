"use client";

import type { Filters } from "@asset-iq/core/types";
import { CONTENT_TYPE_LABELS, titleCase } from "@/lib/labels";

export function FiltersPanel({ value, onChange, industries }: { value: Filters; onChange: (f: Filters) => void; industries: string[] }) {
  const toggle = <K extends "contentTypes" | "industries">(key: K, v: string) => {
    const cur = new Set((value[key] as string[] | undefined) ?? []);
    if (cur.has(v)) cur.delete(v);
    else cur.add(v);
    onChange({ ...value, [key]: cur.size ? [...cur] : undefined });
  };
  return (
    <div className="space-y-4 text-sm">
      <fieldset className="space-y-1">
        <legend className="mb-1 font-medium">Content type</legend>
        {Object.entries(CONTENT_TYPE_LABELS).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2">
            <input type="checkbox" checked={value.contentTypes?.includes(v as never) ?? false} onChange={() => toggle("contentTypes", v)} />
            {l}
          </label>
        ))}
      </fieldset>
      {industries.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="mb-1 font-medium">Industry</legend>
          {industries.map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="checkbox" checked={value.industries?.includes(v) ?? false} onChange={() => toggle("industries", v)} />
              {titleCase(v)}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="space-y-1">
        <legend className="mb-1 font-medium">Published</legend>
        <label className="flex items-center justify-between gap-2">
          From
          <input type="date" className="rounded border bg-transparent px-1" value={value.after ?? ""} onChange={(e) => onChange({ ...value, after: e.target.value || undefined })} />
        </label>
        <label className="flex items-center justify-between gap-2">
          To
          <input type="date" className="rounded border bg-transparent px-1" value={value.before ?? ""} onChange={(e) => onChange({ ...value, before: e.target.value || undefined })} />
        </label>
      </fieldset>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange({})}>
        Clear filters
      </button>
    </div>
  );
}
