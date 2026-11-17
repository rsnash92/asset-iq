"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiError, formatDate } from "@/lib/labels";

interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function ApiKeys() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("Claude Desktop");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      fetch("/api/keys", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<{ keys: KeyRow[] }>) : null))
        .then((body) => body && setKeys(body.keys)),
    [],
  );
  useEffect(() => {
    let alive = true;
    fetch("/api/keys", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ keys: KeyRow[] }>) : null))
      .then((body) => alive && body && setKeys(body.keys));
    return () => {
      alive = false;
    };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return setError(await apiError(res));
    setCreated(((await res.json()) as { key: string }).key);
    void load();
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (!res.ok) return setError(await apiError(res));
    void load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-label="Key name" className="max-w-xs" />
        <Button type="submit">Create key</Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {created && (
        <div className="space-y-1 rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-sm dark:bg-yellow-950">
          <p className="font-medium">Copy your new key now — it won&apos;t be shown again:</p>
          <code className="block break-all rounded bg-background p-2">{created}</code>
        </div>
      )}
      <ul className="divide-y rounded-lg border text-sm">
        {keys.length === 0 && <li className="p-3 text-muted-foreground">No keys yet.</li>}
        {keys.map((k) => (
          <li key={k.id} className="flex items-center gap-3 p-3">
            <span className="font-medium">{k.name}</span>
            <code className="text-muted-foreground">{k.key_prefix}…</code>
            <span className="text-muted-foreground">created {formatDate(k.created_at)}</span>
            <span className="text-muted-foreground">{k.last_used_at ? `used ${formatDate(k.last_used_at)}` : "never used"}</span>
            <span className="ml-auto">
              {k.revoked_at ? (
                <span className="text-muted-foreground">revoked</span>
              ) : (
                <Button size="xs" variant="ghost" onClick={() => revoke(k.id)}>
                  Revoke
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
