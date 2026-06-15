import { describe, expect, it } from "vitest";
import { createCrowdSimBackend } from "./index";

const scene = {
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

describe("CrowdSim backend fetch handler", () => {
  it("creates, resolves, and revokes account sessions", async () => {
    const backend = createCrowdSimBackend({
      nowIso: () => "2026-06-12T00:00:00.000Z",
    });
    const login = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/login",
      {
        body: {
          accountId: "planner",
          displayName: "Planner",
        },
        method: "POST",
      },
    );

    expect(login.status).toBe(201);
    expect(login.body.session.account).toEqual({
      displayName: "Planner",
      id: "planner",
    });
    expect(login.body.session.token).toMatch(/^csess_/);

    const session = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/session",
      {
        headers: {
          authorization: `Bearer ${login.body.session.token}`,
        },
      },
    );
    expect(session.status).toBe(200);
    expect(session.body.session.account.id).toBe("planner");

    const logout = await requestJson<{ revoked: boolean }>(
      backend.fetch,
      "/api/auth/logout",
      {
        headers: {
          authorization: `Bearer ${login.body.session.token}`,
        },
        method: "POST",
      },
    );
    const afterLogout = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/auth/session",
      {
        headers: {
          authorization: `Bearer ${login.body.session.token}`,
        },
      },
    );

    expect(logout.body.revoked).toBe(true);
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error).toBe("auth-session-not-found");
  });

  it("rejects expired account sessions", async () => {
    let nowIso = "2026-06-12T00:00:00.000Z";
    const backend = createCrowdSimBackend({
      nowIso: () => nowIso,
    });
    const login = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/login",
      {
        body: { accountId: "planner" },
        method: "POST",
      },
    );

    nowIso = "2026-06-12T09:00:00.000Z";
    const expired = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/auth/session",
      {
        headers: {
          authorization: `Bearer ${login.body.session.token}`,
        },
      },
    );

    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe("auth-session-not-found");
  });

  it("serves projects, versions, share links, and quota through HTTP", async () => {
    const backend = createCrowdSimBackend({
      nowIso: () => "2026-06-12T00:00:00.000Z",
    });

    const created = await requestJson<ProjectPayload>(backend.fetch, "/api/projects", {
      body: {
        id: "project-1",
        name: "Station Review",
        ownerId: "planner",
        scene,
      },
      method: "POST",
    });

    expect(created.status).toBe(201);
    expect(created.body.project.version).toBe(1);

    const updated = await requestJson<ProjectPayload>(
      backend.fetch,
      "/api/projects/project-1/scene",
      {
        body: {
          actorId: "reviewer",
          expectedVersion: 1,
          scene: { ...scene, name: "Backend Demo Reviewed" },
        },
        method: "PUT",
      },
    );

    expect(updated.status).toBe(200);
    expect(updated.body.project.version).toBe(2);

    const versions = await requestJson<VersionsPayload>(
      backend.fetch,
      "/api/projects/project-1/versions",
    );
    expect(versions.body.versions.map((version) => version.version)).toEqual([1, 2]);

    const share = await requestJson<SharePayload>(
      backend.fetch,
      "/api/projects/project-1/share-links",
      {
        body: {
          actorId: "planner",
          token: "readonly-token",
        },
        method: "POST",
      },
    );
    expect(share.status).toBe(201);
    expect(share.body.shareLink.access).toBe("read-only");

    const resolved = await requestJson<ShareResolvePayload>(
      backend.fetch,
      "/share/readonly-token",
    );
    expect(resolved.body.project.id).toBe("project-1");
    expect(resolved.body.shareLink.token).toBe("readonly-token");

    const usage = await requestJson<UsagePayload>(backend.fetch, "/api/usage/planner", {
      body: {
        amount: 7,
        metric: "experiment-runs",
      },
      method: "POST",
    });
    expect(usage.body.usage.usage).toMatchObject({
      "experiment-runs": 7,
      projects: 1,
      "share-links": 1,
    });
    expect(usage.body.usage.withinQuota).toBe(true);
  });

  it("returns 409 for stale project updates", async () => {
    const backend = createCrowdSimBackend();
    await requestJson(backend.fetch, "/api/projects", {
      body: {
        id: "project-conflict",
        name: "Conflict",
        ownerId: "planner",
        scene,
      },
      method: "POST",
    });

    const conflict = await requestJson<ConflictPayload>(
      backend.fetch,
      "/api/projects/project-conflict/scene",
      {
        body: {
          actorId: "reviewer",
          expectedVersion: 9,
          scene,
        },
        method: "PUT",
      },
    );

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      actualVersion: 1,
      error: "version-conflict",
      expectedVersion: 9,
      projectId: "project-conflict",
    });
  });

  it("rejects unknown quota metrics and missing projects", async () => {
    const backend = createCrowdSimBackend();

    const missingProject = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects/missing-project",
    );
    const invalidMetric = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/usage/planner",
      {
        body: { metric: "tokens" },
        method: "POST",
      },
    );

    expect(missingProject.status).toBe(404);
    expect(missingProject.body.error).toBe("project-not-found");
    expect(invalidMetric.status).toBe(400);
    expect(invalidMetric.body.message).toContain("Unknown usage metric");
  });

  it("routes AI requests through server-side secrets without leaking them", async () => {
    const backend = createCrowdSimBackend({
      aiResponder: ({ payload, provider }) => ({
        payload,
        provider,
        summary: "structured scene draft",
      }),
      aiSecrets: {
        anthropic: "sk-ant-server-only-secret",
      },
    });

    const response = await requestJson<AiProxyPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: {
          payload: { prompt: "station evening peak" },
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: "anthropic",
      routedThroughBackend: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("sk-ant-server-only-secret");
  });

  it("calls AI upstream providers through injectable server fetch", async () => {
    const upstreamRequests: Request[] = [];
    const backend = createCrowdSimBackend({
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

    const response = await requestJson<AiProxyPayload>(
      backend.fetch,
      "/api/ai/openai",
      {
        body: {
          payload: { input: "summarize benchmark results" },
        },
        method: "POST",
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
    const backend = createCrowdSimBackend();

    const leakedSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/anthropic",
      {
        body: {
          payload: {
            apiKey: "sk-ant-client-leak-123456789",
            prompt: "bad request",
          },
        },
        method: "POST",
      },
    );
    const missingServerSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/ai/openai",
      {
        body: {
          payload: { prompt: "safe but not configured" },
        },
        method: "POST",
      },
    );

    expect(leakedSecret.status).toBe(400);
    expect(leakedSecret.body.error).toBe("client-secret-blocked");
    expect(missingServerSecret.status).toBe(503);
    expect(missingServerSecret.body.error).toBe("server-secret-missing");
  });

  it("blocks client-side tile keys and reports missing server tile secrets", async () => {
    const backend = createCrowdSimBackend();
    const leakedSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/tiles/google/tileset.json?key=browser-key",
    );
    const missingServerSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/tiles/google/tileset.json",
    );

    expect(leakedSecret.status).toBe(400);
    expect(leakedSecret.body.error).toBe("client-secret-blocked");
    expect(missingServerSecret.status).toBe(503);
    expect(missingServerSecret.body.error).toBe("tiles-secret-missing");
  });

  it("proxies Google tiles through a server-side key without leaking it", async () => {
    let upstreamRequestUrl = "";
    const backend = createCrowdSimBackend({
      tiles: {
        fetch: async (request) => {
          upstreamRequestUrl = request.url;

          return new Response(JSON.stringify({ root: true }), {
            headers: { "content-type": "application/json" },
          });
        },
        googleApiKey: "server-google-tiles-key",
        upstreamBaseUrl: "https://tiles.example/v1/3dtiles",
      },
    });

    const response = await requestJson<{ root: boolean }>(
      backend.fetch,
      "/api/tiles/google/tileset.json?session=demo",
    );

    expect(response.status).toBe(200);
    expect(response.body.root).toBe(true);
    expect(upstreamRequestUrl).toBe(
      "https://tiles.example/v1/3dtiles/tileset.json?session=demo&key=server-google-tiles-key",
    );
    expect(JSON.stringify(response.body)).not.toContain("server-google-tiles-key");
  });
});

type ProjectPayload = {
  project: {
    id: string;
    version: number;
  };
};

type AuthSessionPayload = {
  session: {
    account: {
      displayName: string;
      id: string;
    };
    expiresAtIso: string;
    token: string;
  };
};

type VersionsPayload = {
  versions: { version: number }[];
};

type SharePayload = {
  shareLink: {
    access: "read-only";
    token: string;
  };
};

type ShareResolvePayload = {
  project: {
    id: string;
  };
  shareLink: {
    token: string;
  };
};

type UsagePayload = {
  usage: {
    usage: Record<string, number>;
    withinQuota: boolean;
  };
};

type ConflictPayload = {
  actualVersion: number;
  error: string;
  expectedVersion: number;
  projectId: string;
};

type ErrorPayload = {
  error: string;
  message?: string;
};

type AiProxyPayload = {
  provider: string;
  result: unknown;
  routedThroughBackend: boolean;
};

async function requestJson<TBody>(
  fetchHandler: (request: Request) => Promise<Response>,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; method?: string } = {},
) {
  const response = await fetchHandler(
    new Request(`https://crowdsim.local${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
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
