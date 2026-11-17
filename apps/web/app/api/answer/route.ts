import { addLlmUsage, anthropicOptions, chatModel, chatModelId, costUsd, enforceRateLimit, isRefusal, logQuery, TIMEOUTS } from "@asset-iq/core";
import { generateText } from "ai";
import { requireUser } from "@/lib/auth";
import { prepareGroundedAnswer } from "@/lib/chat";
import { errorResponse, json, parseJson } from "@/lib/http";
import { AnswerBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Non-streaming grounded answer — same pipeline and prompt as /api/chat, used by
 * the eval suite (LLM-as-judge needs the full answer plus the exact excerpts).
 */
export async function POST(req: Request) {
  const started = Date.now();
  let user: Awaited<ReturnType<typeof requireUser>> | undefined;
  let question = "";
  try {
    user = await requireUser(req);
    // own bucket so an eval run (35 answers) doesn't consume interactive chat quota
    await enforceRateLimit(user.db, "answer", { limit: 100 });
    const body = await parseJson(req, AnswerBodySchema);
    question = body.question;
    const prep = await prepareGroundedAnswer(user.ctx, [{ role: "user", text: question }], body);
    const res = await generateText({
      model: chatModel(),
      system: prep.system,
      messages: prep.messages,
      maxOutputTokens: 2000,
      maxRetries: 2,
      providerOptions: anthropicOptions("low"),
      abortSignal: AbortSignal.timeout(TIMEOUTS.chatLlm),
    });
    addLlmUsage(user.ctx, chatModelId(), res.usage);
    const latencyMs = Date.now() - started;
    await logQuery(user.db, user.ctx, {
      kind: req.headers.get("x-asset-iq-eval") ? "eval" : "chat",
      query: question,
      latencyMs,
      metadata: { endpoint: "answer", mode: prep.sourcesData.mode, backend: prep.sourcesData.backend, reranked: prep.sourcesData.reranked },
    });
    return json({
      answer: res.text,
      refused: isRefusal(res.text),
      sources: prep.sourcesData.sources,
      usage: {
        inputTokens: res.usage.inputTokens ?? 0,
        outputTokens: res.usage.outputTokens ?? 0,
        costUsd: costUsd(user.ctx.usage),
      },
      latencyMs,
    });
  } catch (e) {
    if (user) await logQuery(user.db, user.ctx, { kind: "chat", query: question, latencyMs: Date.now() - started, error: String((e as Error).message) });
    return errorResponse(e);
  }
}
