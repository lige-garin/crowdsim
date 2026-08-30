import {
  createCrowdSimBackend,
  type BackendOptions,
  type CrowdSimBackend,
} from "./index";

/**
 * A backend for tests. Since the login route fails closed, tests have to opt in
 * explicitly to the unauthenticated login they were relying on implicitly. The
 * opt-in lives here, in one place, so no test can quietly reintroduce a
 * permissive login -- and so the default in `createCrowdSimBackend` can stay
 * safe without breaking the suite.
 */
export function createTestBackend(options: BackendOptions = {}): CrowdSimBackend {
  return createCrowdSimBackend({
    allowUnauthenticatedLogin: true,
    ...options,
  });
}

export const scene = {
  schemaVersion: "1.0.0",
  id: "backend-demo",
  name: "Backend Demo",
  world: { height: 16, width: 24 },
  entrances: [
    {
      arrivalRatePerMinute: 24,
      id: "entry",
      kind: "source",
      position: { x: 1, y: 8 },
      width: 2,
    },
    {
      id: "exit",
      kind: "sink",
      position: { x: 23, y: 8 },
      width: 2,
    },
  ],
};
export const aiPayload = {
  max_tokens: 1024,
  messages: [{ content: "station evening peak", role: "user" }],
  model: "claude-sonnet-4-6",
};
export type ProjectPayload = {
  project: {
    id: string;
    name: string;
    ownerId: string;
    version: number;
  };
};

export type ProjectsPayload = {
  projects: { id: string }[];
};

export type AuthSessionPayload = {
  session: {
    account: {
      displayName: string;
      id: string;
    };
    expiresAtIso: string;
    token: string;
  };
};

export type VersionsPayload = {
  versions: { actorId: string; version: number }[];
};

export type SharePayload = {
  shareLink: {
    access: "read-only";
    token: string;
  };
};

export type ShareResolvePayload = {
  project: {
    id: string;
  };
  shareLink: {
    token: string;
  };
};

export type UsagePayload = {
  usage: {
    usage: Record<string, number>;
    withinQuota: boolean;
  };
};

export type ConflictPayload = {
  actualVersion: number;
  error: string;
  expectedVersion: number;
  projectId: string;
};

export type QuotaPayload = {
  error: string;
  limit: number;
  metric: string;
};

export type ErrorPayload = {
  error: string;
  message?: string;
};

export type AiProxyPayload = {
  provider: string;
  result: unknown;
  routedThroughBackend: boolean;
};

export async function login(
  fetchHandler: (request: Request) => Promise<Response>,
  accountId: string,
) {
  const response = await requestJson<AuthSessionPayload>(
    fetchHandler,
    "/api/auth/login",
    { body: { accountId }, method: "POST" },
  );

  return response.body.session.token;
}

export async function requestJson<TBody>(
  fetchHandler: (request: Request) => Promise<Response>,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: string;
    token?: string;
  } = {},
) {
  const response = await fetchHandler(
    new Request(`https://crowdsim.local${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      method: options.method ?? "GET",
    }),
  );

  return {
    body: (await response.json()) as TBody,
    status: response.status,
  };
}
