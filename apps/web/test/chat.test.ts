import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { uiMessagesToTurns } from "@/lib/chat";

describe("uiMessagesToTurns", () => {
  it("keeps user/assistant text, drops data and empty parts", () => {
    const msgs = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Q1" }] },
      { id: "2", role: "assistant", parts: [{ type: "data-sources", data: {} }, { type: "text", text: "A1 [1]" }] },
      { id: "3", role: "assistant", parts: [{ type: "data-sources", data: {} }] },
      { id: "4", role: "user", parts: [{ type: "text", text: "and for contractors?" }] },
    ] as unknown as UIMessage[];
    expect(uiMessagesToTurns(msgs)).toEqual([
      { role: "user", text: "Q1" },
      { role: "assistant", text: "A1 [1]" },
      { role: "user", text: "and for contractors?" },
    ]);
  });
});
