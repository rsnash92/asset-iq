import { generateText } from "ai";
import { TIMEOUTS } from "./config";
import { addLlmUsage, type RequestContext } from "./context";
import { anthropicOptions, fastModel, fastModelId } from "./llm";
import { REWRITE_SYSTEM_PROMPT } from "./prompts";

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Follow-ups like "what about for contractors?" retrieve badly on their own.
 * When there is prior conversation, the cheap model rewrites the last question
 * into a standalone query before retrieval. First turns skip the call entirely.
 */
export async function rewriteFollowUp(ctx: RequestContext, turns: Turn[]): Promise<string> {
  const last = turns.at(-1);
  if (!last || last.role !== "user") throw new Error("last turn must be from the user");
  const history = turns.slice(0, -1).slice(-6);
  if (history.length === 0) return last.text;

  const transcript = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text.slice(0, 1500)}`)
    .join("\n");
  try {
    const res = await generateText({
      model: fastModel(),
      system: REWRITE_SYSTEM_PROMPT,
      prompt: `<conversation>\n${transcript}\n</conversation>\n\nLatest message: ${last.text}`,
      maxOutputTokens: 200,
      providerOptions: anthropicOptions("low"),
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(TIMEOUTS.fastLlm),
    });
    addLlmUsage(ctx, fastModelId(), res.usage);
    const q = res.text.trim().replace(/^["']|["']$/g, "");
    return q.length > 0 && q.length < 500 ? q : last.text;
  } catch (e) {
    // rewriting is an optimisation; on failure retrieve with the raw question
    console.warn("[rewrite] failed, using raw question:", (e as Error).message);
    return last.text;
  }
}
