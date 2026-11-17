import {
  addLlmUsage,
  AGENT_SYSTEM_PROMPT,
  anthropicOptions,
  AppError,
  chatModel,
  chatModelId,
  enforceRateLimit,
  logQuery,
  toAppError,
} from "@asset-iq/core";
import { aiSdkTools } from "@asset-iq/core/agent/ai-sdk";
import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { requireUser } from "@/lib/auth";
import { errorResponse, parseJson } from "@/lib/http";
import { AgentBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Max tool-using steps; one extra step is reserved for the final answer. */
const MAX_TOOL_STEPS = 8;

export async function POST(req: Request) {
  const started = Date.now();
  let user: Awaited<ReturnType<typeof requireUser>> | undefined;
  let task = "";
  try {
    user = await requireUser(req);
    await enforceRateLimit(user.db, "agent");
    const body = await parseJson(req, AgentBodySchema);
    const messages = (body.messages as unknown as UIMessage[]).slice(-12);
    const last = messages.at(-1);
    if (last?.role !== "user") throw new AppError("invalid_input", "last message must be from the user");
    task = last.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");

    const { db, ctx } = user;
    const tools = aiSdkTools(ctx);
    const result = streamText({
      model: chatModel(),
      system: AGENT_SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
      tools,
      // tool_choice stays 'auto' (forced tool choice is rejected by current Claude models)
      stopWhen: isStepCount(MAX_TOOL_STEPS + 1),
      // on the last step, withdraw the tools so the model must write its answer
      prepareStep: ({ stepNumber }) => (stepNumber >= MAX_TOOL_STEPS ? { activeTools: [] } : {}),
      maxOutputTokens: 8000,
      maxRetries: 2,
      providerOptions: anthropicOptions("medium"),
      abortSignal: req.signal,
      onEnd: async ({ totalUsage, steps }) => {
        addLlmUsage(ctx, chatModelId(), totalUsage);
        await logQuery(db, ctx, { kind: "agent", query: task, latencyMs: Date.now() - started, metadata: { steps: steps.length } });
      },
      onError: async ({ error }) => {
        await logQuery(db, ctx, { kind: "agent", query: task, latencyMs: Date.now() - started, error: String((error as Error)?.message ?? error) });
      },
    });
    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("[agent] stream error:", error);
        return toAppError(error).userMessage;
      },
    });
  } catch (e) {
    if (user && !(e instanceof AppError && e.code === "rate_limited")) {
      await logQuery(user.db, user.ctx, { kind: "agent", query: task, latencyMs: Date.now() - started, error: String((e as Error).message) });
    }
    return errorResponse(e);
  }
}
