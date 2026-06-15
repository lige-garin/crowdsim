import type { AiProxyProvider } from "./index";

export type AiProviderFetch = (request: Request) => Promise<Response>;

export type AiProviderUpstreamUrls = Partial<Record<AiProxyProvider, string>>;

export type AiProviderCallInput = {
  fetch?: AiProviderFetch;
  payload: unknown;
  provider: AiProxyProvider;
  secret: string;
  upstreamUrls?: AiProviderUpstreamUrls;
};

export type AiProviderCallResult = {
  provider: AiProxyProvider;
  upstreamStatus: number;
  upstreamBody: unknown;
};

const defaultUpstreamUrls: Record<AiProxyProvider, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/responses",
  vision: "https://api.openai.com/v1/responses",
};

export function createAiProviderRequest(input: AiProviderCallInput) {
  const url =
    input.upstreamUrls?.[input.provider] ?? defaultUpstreamUrls[input.provider];
  const headers = createProviderHeaders(input.provider, input.secret);

  return new Request(url, {
    body: JSON.stringify(input.payload),
    headers,
    method: "POST",
  });
}

export async function callAiProvider(
  input: AiProviderCallInput,
): Promise<AiProviderCallResult> {
  const fetchProvider = input.fetch ?? fetch;
  const response = await fetchProvider(createAiProviderRequest(input));

  return {
    provider: input.provider,
    upstreamBody: await readProviderBody(response),
    upstreamStatus: response.status,
  };
}

function createProviderHeaders(
  provider: AiProxyProvider,
  secret: string,
): Record<string, string> {
  if (provider === "anthropic") {
    return {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": secret,
    };
  }

  return {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  };
}

async function readProviderBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}
