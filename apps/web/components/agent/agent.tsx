"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { collectTitles, stepLabel } from "./step-label";

const TASKS = [
  "Build a reading list for a manufacturing prospect worried about contractor safety.",
  "Summarise our three most recent reports for a CFO.",
  "Draft a landing page summary for our guide on managing contractors.",
];

interface ToolPart {
  type: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
}

const isToolPart = (p: UIMessage["parts"][number]): p is UIMessage["parts"][number] & ToolPart => p.type.startsWith("tool-");

export function Agent() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/agent" }), []);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ transport });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const titles = useMemo(
    () => collectTitles(messages.flatMap((m) => m.parts.filter(isToolPart).map((p) => p.output))),
    [messages],
  );

  function run(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void sendMessage({ text: t });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Agent</h1>
        <p className="text-sm text-muted-foreground">
          Multi-step tasks over your library: search, filter, read, summarise and draft — every claim cited.
        </p>
      </div>

      {messages.length === 0 && (
        <div className="grid gap-2">
          {TASKS.map((t) => (
            <Button key={t} variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => run(t)}>
              {t}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm">
              {m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("")}
            </div>
          ) : (
            <div key={m.id} className="space-y-3" data-testid="agent-message">
              {m.parts.map((p, i) => {
                if (isToolPart(p)) {
                  const tool = p.type.slice(5);
                  const failed = p.state === "output-error" || Boolean(p.output && "error" in p.output);
                  const done = p.state === "output-available";
                  return (
                    <div key={p.toolCallId} className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="agent-step">
                      {failed ? (
                        <CircleAlert className="mt-0.5 size-4 text-destructive" />
                      ) : done ? (
                        <CheckCircle2 className="mt-0.5 size-4 text-green-600" />
                      ) : (
                        <Loader2 className="mt-0.5 size-4 animate-spin" />
                      )}
                      <span>{stepLabel(tool, p.state, p.input, p.output ?? (p.errorText ? { error: p.errorText } : undefined), titles)}</span>
                    </div>
                  );
                }
                if (p.type === "text" && p.text.trim()) {
                  return <AnswerMarkdown key={i} text={p.text} titles={titles} />;
                }
                return null;
              })}
            </div>
          ),
        )}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Working…</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error.message.startsWith("{") ? "The agent hit an error. Please try again." : error.message}</p>}
      </div>

      <form
        className="sticky bottom-0 flex gap-2 border-t bg-background pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(input);
        }}
      >
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe a task…" className="min-h-11 resize-none" rows={2} aria-label="Task" />
        <div className="flex flex-col gap-1">
          {busy ? (
            <Button type="button" variant="outline" onClick={() => stop()}>Stop</Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>Run</Button>
          )}
          {messages.length > 0 && !busy && (
            <Button type="button" variant="ghost" size="xs" onClick={() => setMessages([])}>Clear</Button>
          )}
        </div>
      </form>
    </div>
  );
}
