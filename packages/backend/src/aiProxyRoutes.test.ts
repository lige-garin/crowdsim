import { InMemoryProjectStore } from "@crowdsim/collab";
import { describe, expect, it } from "vitest";
import { createTestBackend } from "./backendTestUtils";
import {
  aiPayload,
  login,
  requestJson,
  type AiProxyPayload,
  type ErrorPayload,
  type QuotaPayload,
  type UsagePayload,
} from "./backendTestUtils";

describe("CrowdSim backend AI proxy routes", () => {
  it("routes AI requests through server-side secrets without leaking them", async () => {
    const backend = createTestBackend({
      aiResponder: ({ payload, provider }) => ({
        payload,
        provider,
        summary: "structured scene draft",
      }),
      aiSecrets: {
        anthropic: "sk-ant-server-only-secret",
      },
    });
    const token = await login(backend.fetch, "planner");

    const response = await requestJson<AiProxyPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: { payload: aiPayload },
        method: "POST",
        token,
      },
    );
    const usage = await requestJson<UsagePayload>(backend.fetch, "/api/usage/planner", {
      token,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: "anthropic",
      routedThroughBackend: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("sk-ant-server-only-secret");
    expect(usage.body.usage.usage["ai-calls"]).toBe(1);
  });

  it("calls AI upstream providers through injectable server fetch", async () => {
    const upstreamRequests: Request[] = [];
    const backend = createTestBackend({
      aiFetch: async (request) => {
        upstreamRequests.push(request);

        return new Response(JSON.stringify({ id: "upstream-response" }), {
          headers: { "content-type": "application/json" },
        });
      },
      aiSecrets: {
        openai: "sk-openai-server-only-secret",
      },
    });
    const token = await login(backend.fetch, "planner");

    const response = await requestJson<AiProxyPayload>(
      backend.fetch,
      "/api/ai/openai",
      {
        body: {
          payload: { max_output_tokens: 512, model: "gpt-4o-mini" },
        },
        method: "POST",
        token,
      },
    );

    expect(response.status).toBe(200);
    expect(upstreamRequests[0].url).toBe("https://api.openai.com/v1/responses");
    expect(upstreamRequests[0].headers.get("authorization")).toBe(
      "Bearer sk-openai-server-only-secret",
    );
    expect(JSON.stringify(response.body)).toContain("upstream-response");
    expect(JSON.stringify(response.body)).not.toContain("sk-openai-server-only-secret");
  });

  it("blocks client-side AI secrets and reports missing server secrets", async () => {
    const backend = createTestBackend();
    const token = await login(backend.fetch, "planner");

    const leakedSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: {
          payload: {
            ...aiPayload,
            apiKey: "sk-ant-client-leak-123456789",
          },
        },
        method: "POST",
        token,
      },
    );
    const missingServerSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/openai",
      {
        body: { payload: aiPayload },
        method: "POST",
        token,
      },
    );

    expect(leakedSecret.status).toBe(400);
    expect(leakedSecret.body.error).toBe("client-secret-blocked");
    expect(missingServerSecret.status).toBe(503);
    expect(missingServerSecret.body.error).toBe("server-secret-missing");
  });

  it("rejects AI payloads outside the model and output-token allowlist", async () => {
    const upstreamCalls: unknown[] = [];
    const backend = createTestBackend({
      aiResponder: ({ payload }) => {
        upstreamCalls.push(payload);

        return { ok: true };
      },
      aiSecrets: { anthropic: "sk-ant-server-only-secret" },
    });
    const token = await login(backend.fetch, "planner");

    const unknownModel = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: { payload: { ...aiPayload, model: "internal-unreleased-model" } },
        method: "POST",
        token,
      },
    );
    const oversizedBudget = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: { payload: { ...aiPayload, max_tokens: 400000 } },
        method: "POST",
        token,
      },
    );
    const missingBudget = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: { payload: { messages: aiPayload.messages, model: aiPayload.model } },
        method: "POST",
        token,
      },
    );
    const allowed = await requestJson<AiProxyPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: { payload: aiPayload },
        method: "POST",
        token,
      },
    );

    expect(unknownModel.status).toBe(400);
    expect(unknownModel.body.error).toBe("ai-model-not-allowed");
    expect(oversizedBudget.status).toBe(400);
    expect(oversizedBudget.body.error).toBe("ai-max-tokens-not-allowed");
    expect(missingBudget.status).toBe(400);
    expect(missingBudget.body.error).toBe("ai-max-tokens-missing");
    expect(allowed.status).toBe(200);
    expect(upstreamCalls).toHaveLength(1);
  });

  it("returns 429 once the AI call quota is exhausted", async () => {
    let providerCalls = 0;
    const backend = createTestBackend({
      aiResponder: () => {
        providerCalls++;

        return { ok: true };
      },
      aiSecrets: { anthropic: "sk-ant-server-only-secret" },
      store: new InMemoryProjectStore({ usageLimits: { "ai-calls": 1 } }),
    });
    const token = await login(backend.fetch, "planner");

    const first = await requestJson<AiProxyPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: { payload: aiPayload },
        method: "POST",
        token,
      },
    );
    const second = await requestJson<QuotaPayload>(backend.fetch, "/api/ai/anthropic", {
      body: { payload: aiPayload },
      method: "POST",
      token,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.metric).toBe("ai-calls");
    expect(providerCalls).toBe(1);
  });
});
