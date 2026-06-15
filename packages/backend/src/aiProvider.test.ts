import { describe, expect, it } from "vitest";
import { callAiProvider, createAiProviderRequest } from "./aiProvider";

describe("AI provider adapter", () => {
  it("creates Anthropic requests with server-side x-api-key headers", async () => {
    const request = createAiProviderRequest({
      payload: { max_tokens: 64, messages: [] },
      provider: "anthropic",
      secret: "sk-ant-server-secret",
    });

    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers.get("x-api-key")).toBe("sk-ant-server-secret");
    expect(request.headers.get("authorization")).toBeNull();
    expect(await request.json()).toEqual({ max_tokens: 64, messages: [] });
  });

  it("calls OpenAI-compatible providers without returning the secret", async () => {
    const upstreamRequests: Request[] = [];
    const result = await callAiProvider({
      fetch: async (request) => {
        upstreamRequests.push(request);

        return new Response(JSON.stringify({ id: "response-1" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
      payload: { input: "Summarize the simulation" },
      provider: "openai",
      secret: "sk-openai-server-secret",
    });
    const upstream = upstreamRequests[0];

    expect(upstream.url).toBe("https://api.openai.com/v1/responses");
    expect(upstream.headers.get("authorization")).toBe(
      "Bearer sk-openai-server-secret",
    );
    expect(result).toEqual({
      provider: "openai",
      upstreamBody: { id: "response-1" },
      upstreamStatus: 200,
    });
    expect(JSON.stringify(result)).not.toContain("sk-openai-server-secret");
  });
});
