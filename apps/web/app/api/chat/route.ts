import { addLlmUsage, anthropicOptions, AppError, chatModel, chatModelId, enforceRateLimit, logQuery, toAppError } from "@asset-iq/core";
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";
import { requireUser } from "@/lib/auth";
import { prepareGroundedAnswer, uiMessagesToTurns } from "@/lib/chat";
import type { ChatUIMessage } from "@/lib/chat-types";
import { errorResponse, parseJson } from "@/lib/http";
import { ChatBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const started = Date.now();
  let user: Awaited<ReturnType<typeof requireUser>> | undefined;
  let question = "";
  try {
    user = await requireUser(req);
    await enforceRateLimit(user.db, "chat");
    const body = await parseJson(req, ChatBodySchema);
    const turns = uiMessagesToTurns(body.messages as unknown as ChatUIMessage[]);
    if (turns.at(-1)?.role !== "user") throw new AppError("invalid_input", "last message must be from the user");
    question = turns.at(-1)!.text;

    // Retrieval happens before the stream opens so failures map to proper HTTP errors.
    const prep = await prepareGroundedAnswer(user.ctx, turns, { filters: body.filters, rerank: body.rerank });
    const { db, ctx } = user;

    const stream = createUIMessageStream<ChatUIMessage>({
      execute: ({ writer }) => {
        writer.write({ type: "data-sources", data: prep.sourcesData });
        const result = streamText({
          model: chatModel(),
          system: prep.system,
          messages: prep.messages,
          maxOutputTokens: 4000,
          maxRetries: 2,
          providerOptions: anthropicOptions("low"),
          abortSignal: req.signal,
          onEnd: async ({ totalUsage }) => {
            addLlmUsage(ctx, chatModelId(), totalUsage);
            await logQuery(db, ctx, {
              kind: "chat",
              query: question,
              latencyMs: Date.now() - started,
              metadata: { standalone_query: prep.sourcesData.standaloneQuery, reranked: prep.sourcesData.reranked, backend: prep.sourcesData.backend },
            });
          },
          onError: async ({ error }) => {
            await logQuery(db, ctx, { kind: "chat", query: question, latencyMs: Date.now() - started, error: String((error as Error)?.message ?? error) });
          },
        });
        writer.merge(result.toUIMessageStream());
      },
      onError: (error) => {
        console.error("[chat] stream error:", error);
        return toAppError(error).userMessage;
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (e) {
    if (user && !(e instanceof AppError && e.code === "rate_limited")) {
      await logQuery(user.db, user.ctx, { kind: "chat", query: question, latencyMs: Date.now() - started, error: String((e as Error).message) });
    }
    return errorResponse(e);
  }
}
