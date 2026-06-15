import { redactSecretsFromLog } from "./apiKeySafety";

export type AiProxyProvider = "anthropic" | "openai" | "vision";

export type AiProxyRequest = {
  body: string;
  headers: Record<string, string>;
  method: "POST";
  url: string;
};

export function createAiProxyRequest(options: {
  payload: unknown;
  provider: AiProxyProvider;
  userId: string;
}): AiProxyRequest {
  assertNoClientSecret(options.payload);

  return {
    body: JSON.stringify({
      payload: options.payload,
      provider: options.provider,
    }),
    headers: {
      "content-type": "application/json",
      "x-crowdsim-user": options.userId,
    },
    method: "POST",
    url: `/api/ai/${options.provider}`,
  };
}

export function assertNoClientSecret(payload: unknown) {
  const redacted = redactSecretsFromLog(payload);
  const original =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);

  if (redacted !== original) {
    throw new Error("AI proxy payload must not contain client-side secrets.");
  }
}
