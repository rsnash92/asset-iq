import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../src/config";
import { createContext } from "../src/context";
import { AppError } from "../src/errors";
import { embedQuery } from "../src/llm";

const ctx = () => createContext({} as never, "owner");

describe("embedQuery (local model via ingest /embed)", () => {
  beforeEach(() => {
    process.env.INGEST_SERVICE_URL = "http://ingest.test";
    process.env.INGEST_SHARED_SECRET = "s3cret";
    delete process.env.EMBEDDINGS_URL;
    resetEnvCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts a query-kind request with the shared secret and returns the vector", async () => {
    const fetchMock = vi.fn(async () => Response.json({ embeddings: [new Array(768).fill(0.1)] }));
    vi.stubGlobal("fetch", fetchMock);
    const c = ctx();
    const v = await embedQuery(c, "who signs permits?");
    expect(v).toHaveLength(768);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://ingest.test/embed");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(init.body as string)).toEqual({ texts: ["who signs permits?"], kind: "query" });
    expect(c.usage.embeddingModel).toBe("nomic-ai/nomic-embed-text-v1.5");
  });

  it("rejects a wrong-dimension vector", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ embeddings: [[1, 2, 3]] })));
    await expect(embedQuery(ctx(), "q")).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("does not retry 4xx, retries 5xx", async () => {
    const f401 = vi.fn(async () => new Response("no", { status: 401 }));
    vi.stubGlobal("fetch", f401);
    await expect(embedQuery(ctx(), "q")).rejects.toBeInstanceOf(AppError);
    expect(f401).toHaveBeenCalledTimes(1);

    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n < 2 ? new Response("x", { status: 503 }) : Response.json({ embeddings: [new Array(768).fill(0)] }))));
    await expect(embedQuery(ctx(), "q")).resolves.toHaveLength(768);
    expect(n).toBe(2);
  });

  it("is not_configured without a service URL", async () => {
    delete process.env.INGEST_SERVICE_URL;
    resetEnvCache();
    await expect(embedQuery(ctx(), "q")).rejects.toMatchObject({ code: "not_configured" });
  });
});
