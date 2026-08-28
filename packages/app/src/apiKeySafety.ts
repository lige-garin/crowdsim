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

export const redactedPlaceholder = "[redacted]";

/**
 * Only shapes that carry a provider prefix. A bare "32+ alphanumerics" rule
 * matches base64 image payloads, scene ids, and hashes, so every screenshot
 * upload came back mangled and real leaks drowned in the noise.
 */
const secretPatterns: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{12,}/g,
  /sk-[A-Za-z0-9_-]{12,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /ya29\.[A-Za-z0-9_-]{20,}/g,
];

const secretKeyNamePattern =
  /^(access[_-]?token|api[_-]?key|authorization|client[_-]?secret|credential|password|private[_-]?key|refresh[_-]?token|secret|session[_-]?token|token)$/i;

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

/**
 * Replaces the whole match. Keeping the first and last four characters handed
 * an attacker eight characters of the real key for free.
 */
export function redactSecret(value: string) {
  return secretPatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, redactedPlaceholder),
    value,
  );
}

export function redactSecretsFromLog(value: unknown) {
  return redactSecret(
    typeof value === "string"
      ? value
      : JSON.stringify(redactSecretKeys(value), null, 2),
  );
}

function redactSecretKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecretKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      secretKeyNamePattern.test(key) ? redactedPlaceholder : redactSecretKeys(nested),
    ]),
  );
}
