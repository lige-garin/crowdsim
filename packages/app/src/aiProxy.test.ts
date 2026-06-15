import { describe, expect, it } from "vitest";
import { createAiProxyRequest } from "./aiProxy";

describe("AI proxy contract", () => {
  it("creates backend-bound requests without authorization headers", () => {
    const request = createAiProxyRequest({
      payload: { prompt: "Create a station scene" },
      provider: "anthropic",
      userId: "planner-1",
    });

    expect(request).toMatchObject({
      method: "POST",
      url: "/api/ai/anthropic",
    });
    expect(request.headers).not.toHaveProperty("authorization");
    expect(JSON.parse(request.body)).toEqual({
      payload: { prompt: "Create a station scene" },
      provider: "anthropic",
    });
  });

  it("rejects payloads that contain likely client secrets", () => {
    expect(() =>
      createAiProxyRequest({
        payload: { apiKey: "sk-clientsecret1234567890" },
        provider: "openai",
        userId: "planner-1",
      }),
    ).toThrow(/client-side secrets/);
  });
});
