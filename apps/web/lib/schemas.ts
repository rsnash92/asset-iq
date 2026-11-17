import { BackendSchema, FiltersSchema, SearchModeSchema } from "@asset-iq/core";
import { z } from "zod";

export const RetrievalOptionsSchema = z.object({
  k: z.number().int().min(1).max(30).optional(),
  filters: FiltersSchema.optional(),
  mode: SearchModeSchema.optional(),
  rerank: z.boolean().optional(),
  backend: BackendSchema.optional(),
});

export const SearchBodySchema = RetrievalOptionsSchema.extend({
  query: z.string().trim().min(1).max(1000),
});

export const AnswerBodySchema = RetrievalOptionsSchema.extend({
  question: z.string().trim().min(1).max(2000),
});

const UIMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.object({ type: z.string() }).passthrough()).max(200),
  })
  .passthrough();

export const ChatBodySchema = z
  .object({
    messages: z.array(UIMessageSchema).min(1).max(100),
    filters: FiltersSchema.optional(),
    rerank: z.boolean().optional(),
  })
  .passthrough();

export const AgentBodySchema = z.object({ messages: z.array(UIMessageSchema).min(1).max(100) }).passthrough();
