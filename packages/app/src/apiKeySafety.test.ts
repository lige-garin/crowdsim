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
    expect(serialized).toContain('"redacted":"[redacted]"');
  });

  it("redacts secrets from log strings and objects", () => {
    expect(redactSecret("token sk-live_abcdefghijklmnopqrstuvwxyz")).toBe(
      "token [redacted]",
    );
    expect(
      redactSecretsFromLog({
        authorization: "sk-live_abcdefghijklmnopqrstuvwxyz",
      }),
    ).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("leaves no fragment of the original secret behind", () => {
    const secrets = [
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345",
      "sk-proj-abcdefghijklmnopqrstuvwxyz",
      "AIzaSyA1234567890abcdefghijklmnopqrstu",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    ];

    for (const secret of secrets) {
      const redacted = redactSecret(`authorization: ${secret}`);

      expect(redacted).toBe("authorization: [redacted]");
      expect(redacted).not.toContain(secret.slice(0, 4));
      expect(redacted).not.toContain(secret.slice(-4));
    }
  });

  it("leaves long non-secret payloads intact", () => {
    // The old [a-zA-Z0-9_-]{32,} rule flagged every one of these.
    const untouched = [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
      "a3f5c9d1e7b2486fa0c4d8e2b6f1930745bc8ade12f4c7b93e0a6d5182f4c9be",
      "/assets/bio-city-plaza-model-2026-06-12-highdetail-variant-a.glb",
      "scene-id-1234567890abcdefghijklmnopqrstuvwxyz",
    ];

    for (const value of untouched) {
      expect(redactSecret(value)).toBe(value);
    }

    const payload = {
      basemapDataUrl: untouched[0],
      prompt: "Create a station scene",
      reproducibilityHash: untouched[1],
    };
    expect(redactSecretsFromLog(payload)).toBe(JSON.stringify(payload, null, 2));
  });

  it("redacts values held under secret-looking keys whatever their shape", () => {
    const redacted = redactSecretsFromLog({
      apiKey: "plain-value-without-a-prefix",
      headers: { authorization: "Bearer opaque-session-value" },
      nested: [{ password: "hunter2" }],
      provider: "anthropic",
    });

    expect(redacted).not.toContain("plain-value-without-a-prefix");
    expect(redacted).not.toContain("opaque-session-value");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).toContain("anthropic");
  });
});
