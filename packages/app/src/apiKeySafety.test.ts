import { describe, expect, it } from "vitest";
import {
  createEphemeralApiKeySession,
  redactSecret,
  redactSecretsFromLog,
} from "./apiKeySafety";

describe("API key safety", () => {
  it("keeps API keys out of JSON serialization", () => {
    const session = createEphemeralApiKeySession({
      apiKey: "sk-test_1234567890abcdef",
      createdAtIso: "2026-06-12T00:00:00.000Z",
      provider: "openai",
    });
    const serialized = JSON.stringify(session);

    expect(session.getAuthorizationHeader()).toBe("Bearer sk-test_1234567890abcdef");
    expect(serialized).not.toContain("1234567890abcdef");
    expect(serialized).toContain("sk-t...cdef");
  });

  it("redacts secrets from log strings and objects", () => {
    expect(redactSecret("token sk-live_abcdefghijklmnopqrstuvwxyz")).toBe(
      "token sk-l...wxyz",
    );
    expect(
      redactSecretsFromLog({
        authorization: "sk-live_abcdefghijklmnopqrstuvwxyz",
      }),
    ).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
