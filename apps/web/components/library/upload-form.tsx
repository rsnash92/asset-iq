"use client";

import { CONTENT_TYPES } from "@asset-iq/core/types";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiError, CONTENT_TYPE_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.md,.markdown,.txt";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("guide");
  const [industry, setIndustry] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(f: File | undefined) {
    setError("");
    if (!f) return;
    if (!/\.(pdf|md|markdown|txt)$/i.test(f.name)) return setError("Only PDF, Markdown and text files are supported.");
    if (f.size > MAX_BYTES) return setError("Files must be 20 MB or smaller.");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const init = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, size: file.size }),
      });
      if (!init.ok) throw new Error(await apiError(init));
      const { documentId, path, token, mimeType } = (await init.json()) as { documentId: string; path: string; token: string; mimeType: string };

      const { error: upErr } = await createClient()
        .storage.from("documents")
        .uploadToSignedUrl(path, token, file, { contentType: mimeType });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const done = await fetch(`/api/documents/${documentId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, title, contentType, industry, publishedAt }),
      });
      if (!done.ok) throw new Error(await apiError(done));

      setFile(null);
      setTitle("");
      setIndustry("");
      setPublishedAt("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={upload} className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground transition-colors",
              dragging && "border-primary bg-muted",
            )}
            data-testid="dropzone"
          >
            {file ? (
              <>
                <span className="font-medium text-foreground">{file.name}</span>
                <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Drop a file here or click to browse</span>
                <span>PDF, Markdown or text · max 20 MB</span>
              </>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="file-input" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ctype">Content type</Label>
              <select
                id="ctype"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONTENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. manufacturing" maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="published">Published</Label>
              <Input id="published" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={!file || busy} className="w-full">
                {busy ? "Uploading…" : "Upload"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
