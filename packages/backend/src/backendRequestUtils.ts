import type { UsageMetric } from "@crowdsim/collab";
import type { ProjectArtifactKind } from "./storage";

export type AiProxyProvider = "anthropic" | "openai" | "vision";

const aiProviders = new Set<AiProxyProvider>(["anthropic", "openai", "vision"]);
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};
const usageMetrics = new Set<UsageMetric>([
  "ai-calls",
  "experiment-runs",
  "projects",
  "share-links",
  "stored-replays",
  "tiles-requests",
]);

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json()) as unknown;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected a JSON object body");
  }

  return body as Record<string, unknown>;
}

export function readField(body: Record<string, unknown>, key: string) {
  if (!(key in body)) {
    throw new Error(`Missing field '${key}'`);
  }

  return body[key];
}

export function readString(body: Record<string, unknown>, key: string) {
  const value = readField(body, key);

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Field '${key}' must be a non-empty string`);
  }

  return value;
}

export function readOptionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Field '${key}' must be a non-empty string`);
  }

  return value;
}

export function readNumber(body: Record<string, unknown>, key: string) {
  const value = readField(body, key);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Field '${key}' must be a finite number`);
  }

  return value;
}

export function readOptionalNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Field '${key}' must be a finite number`);
  }

  return value;
}

export function readUsageMetric(body: Record<string, unknown>) {
  const metric = readString(body, "metric");

  if (!usageMetrics.has(metric as UsageMetric)) {
    throw new Error(`Unknown usage metric '${metric}'`);
  }

  return metric as UsageMetric;
}

export function readAiProvider(provider: string | undefined) {
  if (!provider || !aiProviders.has(provider as AiProxyProvider)) {
    throw new Error(`Unknown AI provider '${provider ?? ""}'`);
  }

  return provider as AiProxyProvider;
}

export function readArtifactKind(kind: string | undefined): ProjectArtifactKind {
  if (kind === "replay" || kind === "report") {
    return kind;
  }

  throw new Error(`Unknown project artifact kind '${kind ?? ""}'`);
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

export function containsLikelyClientSecret(value: unknown): boolean {
  if (typeof value === "string") {
    return /(sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9_.-]{8,})/i.test(value);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(containsLikelyClientSecret);
  }

  return Object.entries(value).some(([key, nested]) => {
    const secretKeyName = /^(api[_-]?key|authorization|secret|token)$/i.test(key);

    return secretKeyName || containsLikelyClientSecret(nested);
  });
}

export function containsSecretSearchParam(url: URL) {
  return Array.from(url.searchParams.keys()).some((key) =>
    /^(api[_-]?key|authorization|key|secret|token)$/i.test(key),
  );
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: jsonHeaders,
    status,
  });
}

export function quotaResponse(metric: UsageMetric, limit: number) {
  return jsonResponse(
    {
      error: "usage-quota-exceeded",
      limit,
      message: `Usage quota for '${metric}' is exhausted.`,
      metric,
    },
    429,
  );
}
