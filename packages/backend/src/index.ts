import { InMemoryProjectStore, ProjectVersionConflictError } from "@crowdsim/collab";
import { parseScene } from "@crowdsim/scene-schema";
import { callAiProvider, type AiProviderFetch } from "./aiProvider";
import { AuthSessionStore } from "./auth";
import {
  containsLikelyClientSecret,
  containsSecretSearchParam,
  jsonResponse,
  readAiProvider,
  readArtifactKind,
  readBearerToken,
  readField,
  readJson,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readString,
  readUsageMetric,
  type AiProxyProvider,
} from "./backendRequestUtils";
import type { ProjectArtifactStore, ProjectStore } from "./storage";

export type CrowdSimBackend = {
  auth: AuthSessionStore;
  fetch: (request: Request) => Promise<Response>;
  store: ProjectStore;
};

export type AiProxyResponder = (input: {
  payload: unknown;
  provider: AiProxyProvider;
}) => Promise<unknown> | unknown;

export type BackendOptions = {
  auth?: AuthSessionStore;
  aiResponder?: AiProxyResponder;
  aiFetch?: AiProviderFetch;
  aiSecrets?: Partial<Record<AiProxyProvider, string>>;
  artifacts?: ProjectArtifactStore;
  nowIso?: () => string;
  store?: ProjectStore;
  tiles?: TilesProxyOptions;
};

export type TilesProxyOptions = {
  fetch?: (request: Request) => Promise<Response>;
  googleApiKey?: string;
  upstreamBaseUrl?: string;
};

export function createCrowdSimBackend(options: BackendOptions = {}): CrowdSimBackend {
  const auth = options.auth ?? new AuthSessionStore();
  const store = options.store ?? new InMemoryProjectStore();
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  return {
    auth,
    store,
    fetch: async (request) => {
      try {
        return await routeRequest(request, store, auth, {
          aiResponder: options.aiResponder,
          aiFetch: options.aiFetch,
          aiSecrets: options.aiSecrets ?? {},
          artifacts: options.artifacts,
          nowIso,
          tiles: options.tiles ?? {},
        });
      } catch (error) {
        if (error instanceof ProjectVersionConflictError) {
          return jsonResponse(
            {
              actualVersion: error.actualVersion,
              error: "version-conflict",
              expectedVersion: error.expectedVersion,
              projectId: error.projectId,
            },
            409,
          );
        }

        return jsonResponse(
          {
            error: "bad-request",
            message: error instanceof Error ? error.message : "Invalid request",
          },
          400,
        );
      }
    },
  };
}

async function routeRequest(
  request: Request,
  store: ProjectStore,
  auth: AuthSessionStore,
  options: {
    aiResponder?: AiProxyResponder;
    aiFetch?: AiProviderFetch;
    aiSecrets: Partial<Record<AiProxyProvider, string>>;
    artifacts?: ProjectArtifactStore;
    nowIso: () => string;
    tiles: TilesProxyOptions;
  },
) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const segments = url.pathname.split("/").filter(Boolean);
  const nowIso = options.nowIso;

  if (method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, service: "crowdsim-backend" });
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const session = auth.createSession({
      accountId: readString(body, "accountId"),
      displayName: readOptionalString(body, "displayName"),
      nowIso: nowIso(),
    });

    return jsonResponse({ session }, 201);
  }

  if (method === "GET" && url.pathname === "/api/auth/session") {
    const token = readBearerToken(request);
    const session = token ? auth.resolveSession(token, nowIso()) : null;

    return session
      ? jsonResponse({ session })
      : jsonResponse({ error: "auth-session-not-found" }, 401);
  }

  if (method === "POST" && url.pathname === "/api/auth/logout") {
    const token = readBearerToken(request);

    return token && auth.revokeSession(token)
      ? jsonResponse({ revoked: true })
      : jsonResponse({ error: "auth-session-not-found" }, 401);
  }

  if (method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson(request);
    const project = await store.createProject({
      id: readString(body, "id"),
      name: readString(body, "name"),
      ownerId: readString(body, "ownerId"),
      scene: parseScene(readField(body, "scene")),
      timestampIso: nowIso(),
    });

    return jsonResponse({ project }, 201);
  }

  if (method === "GET" && url.pathname === "/api/projects") {
    return jsonResponse({
      projects: await store.listProjects(url.searchParams.get("ownerId") ?? undefined),
    });
  }

  if (segments[0] === "api" && segments[1] === "projects" && segments[2]) {
    const projectId = segments[2];

    if (method === "GET" && segments.length === 3) {
      const project = await store.getProject(projectId);

      return project
        ? jsonResponse({ project })
        : jsonResponse({ error: "project-not-found" }, 404);
    }

    if (method === "PUT" && segments[3] === "scene" && segments.length === 4) {
      const body = await readJson(request);
      const project = await store.updateScene({
        actorId: readString(body, "actorId"),
        expectedVersion: readNumber(body, "expectedVersion"),
        projectId,
        scene: parseScene(readField(body, "scene")),
        timestampIso: nowIso(),
      });

      return project
        ? jsonResponse({ project })
        : jsonResponse({ error: "project-not-found" }, 404);
    }

    if (method === "GET" && segments[3] === "versions" && segments.length === 4) {
      return jsonResponse({ versions: await store.listProjectVersions(projectId) });
    }

    if (method === "POST" && segments[3] === "share-links" && segments.length === 4) {
      const body = await readJson(request);
      const shareLink = await store.createReadOnlyShareLink({
        actorId: readString(body, "actorId"),
        expiresAtIso: readOptionalString(body, "expiresAtIso"),
        projectId,
        timestampIso: nowIso(),
        token: readString(body, "token"),
      });

      return shareLink
        ? jsonResponse({ shareLink }, 201)
        : jsonResponse({ error: "project-not-found" }, 404);
    }

    if (segments[3] === "artifacts" && segments.length === 6) {
      return handleProjectArtifactRequest(request, segments, options, nowIso);
    }
  }

  if (method === "GET" && segments[0] === "share" && segments[1]) {
    const resolved = await store.resolveShareLink(segments[1], nowIso());

    return resolved
      ? jsonResponse(resolved)
      : jsonResponse({ error: "share-link-not-found" }, 404);
  }

  if (segments[0] === "api" && segments[1] === "usage" && segments[2]) {
    const ownerId = segments[2];

    if (method === "GET" && segments.length === 3) {
      return jsonResponse({ usage: await store.getUsageSnapshot(ownerId) });
    }

    if (method === "POST" && segments.length === 3) {
      const body = await readJson(request);
      const metric = readUsageMetric(body);
      const amount = readOptionalNumber(body, "amount") ?? 1;

      return jsonResponse({
        usage: await store.recordUsage(ownerId, metric, amount),
      });
    }
  }

  if (
    method === "GET" &&
    segments[0] === "api" &&
    segments[1] === "tiles" &&
    segments[2] === "google"
  ) {
    return proxyGoogleTilesRequest(request, url, segments, options.tiles);
  }

  if (method === "POST" && segments[0] === "api" && segments[1] === "ai") {
    const provider = readAiProvider(segments[2]);
    const body = await readJson(request);

    if (containsLikelyClientSecret(body)) {
      return jsonResponse(
        {
          error: "client-secret-blocked",
          message: "AI proxy payload must not include client-side secrets.",
        },
        400,
      );
    }

    const serverSecret = options.aiSecrets[provider];

    if (!serverSecret) {
      return jsonResponse(
        {
          error: "server-secret-missing",
          message: `Server-side ${provider} secret is not configured.`,
        },
        503,
      );
    }

    const payload = readField(body, "payload");
    const result = options.aiResponder
      ? await options.aiResponder({ payload, provider })
      : await callAiProvider({
          fetch: options.aiFetch,
          payload,
          provider,
          secret: serverSecret,
        });

    return jsonResponse({
      provider,
      result,
      routedThroughBackend: true,
    });
  }

  return jsonResponse({ error: "not-found" }, 404);
}

async function handleProjectArtifactRequest(
  request: Request,
  segments: readonly string[],
  options: {
    artifacts?: ProjectArtifactStore;
  },
  nowIso: () => string,
) {
  if (!options.artifacts) {
    return jsonResponse(
      {
        error: "project-artifact-store-missing",
        message: "Replay and report artifacts require an R2-backed store.",
      },
      503,
    );
  }

  const projectId = segments[2];
  const kind = readArtifactKind(segments[4]);
  const artifactId = segments[5];

  if (request.method.toUpperCase() === "POST") {
    const record = await options.artifacts.putProjectArtifact({
      actorId: request.headers.get("x-crowdsim-actor") ?? "system",
      artifactId,
      body: await request.arrayBuffer(),
      contentType: request.headers.get("content-type") ?? "application/octet-stream",
      kind,
      projectId,
      timestampIso: nowIso(),
    });

    return record
      ? jsonResponse({ artifact: record }, 201)
      : jsonResponse({ error: "project-not-found" }, 404);
  }

  if (request.method.toUpperCase() === "GET") {
    const artifact = await options.artifacts.getProjectArtifact(
      projectId,
      kind,
      artifactId,
    );

    return artifact
      ? new Response(artifact.body, {
          headers: {
            "content-type": artifact.record.contentType,
            "x-crowdsim-artifact-key": artifact.record.key,
          },
        })
      : jsonResponse({ error: "project-artifact-not-found" }, 404);
  }

  return jsonResponse({ error: "not-found" }, 404);
}

async function proxyGoogleTilesRequest(
  request: Request,
  url: URL,
  segments: readonly string[],
  options: TilesProxyOptions,
) {
  if (containsSecretSearchParam(url)) {
    return jsonResponse(
      {
        error: "client-secret-blocked",
        message: "Tiles proxy URL must not include client-side keys or tokens.",
      },
      400,
    );
  }

  if (!options.googleApiKey) {
    return jsonResponse(
      {
        error: "tiles-secret-missing",
        message: "Server-side Google tiles key is not configured.",
      },
      503,
    );
  }

  const upstreamUrl = createGoogleTilesUpstreamUrl(url, segments, options);
  const fetchTiles = options.fetch ?? fetch;
  const upstreamResponse = await fetchTiles(
    new Request(upstreamUrl, {
      headers: {
        accept: request.headers.get("accept") ?? "*/*",
        "x-crowdsim-tiles-proxy": "google-photorealistic-3d-tiles",
      },
      method: "GET",
    }),
  );

  return new Response(upstreamResponse.body, {
    headers: upstreamResponse.headers,
    status: upstreamResponse.status,
  });
}

function createGoogleTilesUpstreamUrl(
  url: URL,
  segments: readonly string[],
  options: TilesProxyOptions,
) {
  const upstreamBaseUrl =
    options.upstreamBaseUrl ?? "https://tile.googleapis.com/v1/3dtiles";
  const upstream = new URL(upstreamBaseUrl);
  const basePath = upstream.pathname.replace(/\/+$/, "");
  const tilePath = segments.slice(3).join("/") || "tileset.json";

  if (tilePath.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Tiles path must not contain traversal segments");
  }

  upstream.pathname = `${basePath}/${tilePath}`;
  url.searchParams.forEach((value, key) => {
    upstream.searchParams.append(key, value);
  });
  upstream.searchParams.set("key", options.googleApiKey ?? "");

  return upstream;
}

export { D1R2ProjectStore, cloudflareD1SchemaSql } from "./cloudflare";
export { callAiProvider, createAiProviderRequest } from "./aiProvider";
export type { AiProxyProvider } from "./backendRequestUtils";
export type {
  AiProviderCallInput,
  AiProviderCallResult,
  AiProviderFetch,
  AiProviderUpstreamUrls,
} from "./aiProvider";
export type {
  ProjectArtifactKind,
  ProjectArtifactRecord,
  ProjectArtifactStore,
  ProjectStore,
} from "./storage";
