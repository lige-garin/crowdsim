export type EphemeralApiKeySession = {
  createdAtIso: string;
  getAuthorizationHeader: () => string;
  hasKey: boolean;
  provider: string;
  toJSON: () => {
    createdAtIso: string;
    hasKey: boolean;
    provider: string;
    redacted: string;
  };
};

const secretPattern = /(sk-[a-zA-Z0-9_-]{8,}|[a-zA-Z0-9_-]{32,})/g;

export function createEphemeralApiKeySession(options: {
  apiKey: string;
  createdAtIso?: string;
  provider: string;
}): EphemeralApiKeySession {
  const apiKey = options.apiKey;

  return {
    createdAtIso: options.createdAtIso ?? new Date().toISOString(),
    getAuthorizationHeader: () => `Bearer ${apiKey}`,
    hasKey: apiKey.length > 0,
    provider: options.provider,
    toJSON() {
      return {
        createdAtIso: this.createdAtIso,
        hasKey: this.hasKey,
        provider: this.provider,
        redacted: redactSecret(apiKey),
      };
    },
  };
}

export function redactSecret(value: string) {
  return value.replace(secretPattern, (match) =>
    match.length <= 8 ? "****" : `${match.slice(0, 4)}...${match.slice(-4)}`,
  );
}

export function redactSecretsFromLog(value: unknown) {
  return redactSecret(
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
}
