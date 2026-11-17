import { tool, type ToolSet } from "ai";
import type { RequestContext } from "../context";
import { AppError } from "../errors";
import { AGENT_TOOLS, runTool } from "./tools";

/**
 * Wrap the framework-agnostic tool definitions as AI SDK tools bound to one
 * request context. Errors are returned to the model as data (so it can recover,
 * e.g. pick another document) rather than aborting the whole run.
 */
export function aiSdkTools(ctx: RequestContext): ToolSet {
  const out: ToolSet = {};
  for (const def of AGENT_TOOLS) {
    out[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown) => {
        try {
          return await runTool(ctx, def as never, input);
        } catch (e) {
          const err = e instanceof AppError ? e : null;
          return { error: err?.userMessage ?? "The tool failed unexpectedly." };
        }
      },
    });
  }
  return out;
}
