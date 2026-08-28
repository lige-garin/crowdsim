import {
  InMemoryProjectStore,
  ProjectAlreadyExistsError,
  ProjectVersionConflictError,
  UsageQuotaExceededError,
} from "@crowdsim/collab";
import { parseScene } from "@crowdsim/scene-schema";
import {
  checkAiPayload,
  defaultAiPayloadPolicy,
  type AiPayloadPolicy,
} from "./aiPolicy";
import { callAiProvider, type AiProviderFetch } from "./aiProvider";
import { AuthSessionStore, type AuthSessionRecord } from "./auth";
import {
  containsLikelyClientSecret,
  jsonResponse,
  quotaResponse,
  readAiProvider,
  readBearerToken,
  readField,
  readJson,
  readOptionalString,
  readString,
  type AiProxyProvider,
} from "./backendRequestUtils";
import {
  assertCorsOptions,
  createPreflightResponse,
  resolveCorsHeaders,
  withCorsHeaders,
  type CorsOptions,
} from "./cors";
import {
  checkQuota,
  routeProjectRequest,
  routeUsageRequest,
  toSharedReadOnlyPayload,
} from "./projectRoutes";
import {
  checkTilesProxyRequest,
  proxyGoogleTilesRequest,
  type TilesProxyOptions,
} from "./tilesProxy";
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
  aiFetch?: AiProviderFetch;
  aiPolicy?: AiPayloadPolicy;
  aiResponder?: AiProxyResponder;
  aiSecrets?: Partial<Record<AiProxyProvider, string>>;
  artifacts?: ProjectArtifactStore;
  cors?: CorsOptions;
  nowIso?: () => string;
  store?: ProjectStore;
  tiles?: TilesProxyOptions;
  verifyLogin?: LoginVerifier;
};

/**
 * The login route has no credential store of its own, so a deployment that
 * needs real authentication plugs it in here. Without a verifier any caller
 * can claim any accountId, which is only acceptable for local development.
 */
export type LoginVerifier = (input: {
  accountId: string;
  body: Record<string, unknown>;
  request: Request;
}) => boolean | Promise<boolean>;

type RouteOptions = {
  aiFetch?: AiProviderFetch;
  aiPolicy: AiPayloadPolicy;
  aiResponder?: AiProxyResponder;
  aiSecrets: Partial<Record<AiProxyProvider, string>>;
  artifacts?: ProjectArtifactStore;
  nowIso: () => string;
  tiles: TilesProxyOptions;
  verifyLogin?: LoginVerifier;
};

export function createCrowdSimBackend(options: BackendOptions = {}): CrowdSimBackend {
  const auth = options.auth ?? new AuthSessionStore();
  const store = options.store ?? new InMemoryProjectStore();
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const cors = options.cors ?? {};

  assertCorsOptions(cors);

  return {
    auth,
    store,
    fetch: async (request) => {
      const corsHeaders = resolveCorsHeaders(request, cors);

      if (request.method.toUpperCase() === "OPTIONS") {
        return createPreflightResponse(request, cors);
      }

      try {
        const response = await routeRequest(request, store, auth, {
          aiFetch: options.aiFetch,
          aiPolicy: options.aiPolicy ?? defaultAiPayloadPolicy,
          aiResponder: options.aiResponder,
          aiSecrets: options.aiSecrets ?? {},
          artifacts: options.artifacts,
          nowIso,
          tiles: options.tiles ?? {},
          verifyLogin: options.verifyLogin,
        });

        return withCorsHeaders(response, corsHeaders);
      } catch (error) {
        return withCorsHeaders(createErrorResponse(error), corsHeaders);
      }
    },
  };
}

function createErrorResponse(error: unknown) {
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

  if (error instanceof ProjectAlreadyExistsError) {
    return jsonResponse(
      { error: "project-already-exists", projectId: error.projectId },
      409,
    );
  }

  if (error instanceof UsageQuotaExceededError) {
    return quotaResponse(error.metric, error.limit);
  }

  return jsonResponse(
    {
      error: "bad-request",
      message: error instanceof Error ? error.message : "Invalid request",
    },
    400,
  );
}

async function routeRequest(
  request: Request,
  store: ProjectStore,
  auth: AuthSessionStore,
  options: RouteOptions,
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
    const accountId = readString(body, "accountId");

    if (
      options.verifyLogin &&
      !(await options.verifyLogin({ accountId, body, request }))
    ) {
      return jsonResponse({ error: "login-rejected" }, 401);
    }

    const session = auth.createSession({
      accountId,
      displayName: readOptionalString(body, "displayName"),
      nowIso: nowIso(),
    });

    return jsonResponse({ session }, 201);
  }

  // Resolved once, up front, so no route below can forget to ask.
  const token = readBearerToken(request);
  const session = token ? auth.resolveSession(token, nowIso()) : null;

  if (method === "GET" && url.pathname === "/api/auth/session") {
    return session
      ? jsonResponse({ session })
      : jsonResponse({ error: "auth-session-not-found" }, 401);
  }

  if (method === "POST" && url.pathname === "/api/auth/logout") {
    return token && auth.revokeSession(token)
      ? jsonResponse({ revoked: true })
      : jsonResponse({ error: "auth-session-not-found" }, 401);
  }

  // Anonymous read access is the entire point of a share link, so it stays
  // public but only ever serves the read-only projection.
  if (method === "GET" && segments[0] === "share" && segments[1]) {
    const resolved = await store.resolveShareLink(segments[1], nowIso());

    return resolved
      ? jsonResponse(toSharedReadOnlyPayload(resolved))
      : jsonResponse({ error: "share-link-not-found" }, 404);
  }

  if (!session) {
    return jsonResponse({ error: "auth-required" }, 401);
  }

  return routeAuthenticatedRequest(request, store, session, options, {
    method,
    segments,
    url,
  });
}

async function routeAuthenticatedRequest(
  request: Request,
  store: ProjectStore,
  session: AuthSessionRecord,
  options: RouteOptions,
  route: { method: string; segments: string[]; url: URL },
) {
  const { method, segments, url } = route;
  const nowIso = options.nowIso;
  const ownerId = session.account.id;

  if (method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson(request);
    const project = await store.createProject({
      id: readString(body, "id"),
      name: readString(body, "name"),
      // Ownership comes from the session; a body-supplied ownerId would let a
      // caller file projects under someone else's account.
      ownerId,
      scene: parseScene(readField(body, "scene")),
      timestampIso: nowIso(),
    });

    return jsonResponse({ project }, 201);
  }

  if (method === "GET" && url.pathname === "/api/projects") {
    return jsonResponse({ projects: await store.listProjects(ownerId) });
  }

  if (segments[0] === "api" && segments[1] === "projects" && segments[2]) {
    return routeProjectRequest(request, store, session, options, {
      method,
      projectId: segments[2],
      segments,
    });
  }

  if (segments[0] === "api" && segments[1] === "usage" && segments[2]) {
    return routeUsageRequest(request, store, ownerId, { method, segments });
  }

  if (
    method === "GET" &&
    segments[0] === "api" &&
    segments[1] === "tiles" &&
    segments[2] === "google"
  ) {
    const refusal = checkTilesProxyRequest(url, options.tiles);

    if (refusal) {
      return refusal;
    }

    const quota = await checkQuota(store, ownerId, "tiles-requests");

    if (quota) {
      return quota;
    }

    const response = await proxyGoogleTilesRequest(
      request,
      url,
      segments,
      options.tiles,
    );

    await store.recordUsage(ownerId, "tiles-requests");

    return response;
  }

  if (method === "POST" && segments[0] === "api" && segments[1] === "ai") {
    return handleAiProxyRequest(request, store, ownerId, options, segments);
  }

  return jsonResponse({ error: "not-found" }, 404);
}

async function handleAiProxyRequest(
  request: Request,
  store: ProjectStore,
  ownerId: string,
  options: RouteOptions,
  segments: string[],
) {
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

  const payload = readField(body, "payload");
  const rejection = checkAiPayload(payload, options.aiPolicy);

  if (rejection) {
    return jsonResponse(rejection, 400);
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

  const quota = await checkQuota(store, ownerId, "ai-calls");

  if (quota) {
    return quota;
  }

  const result = options.aiResponder
    ? await options.aiResponder({ payload, provider })
    : await callAiProvider({
        fetch: options.aiFetch,
        payload,
        provider,
        secret: serverSecret,
      });

  await store.recordUsage(ownerId, "ai-calls");

  return jsonResponse({
    provider,
    result,
    routedThroughBackend: true,
  });
}

export { D1R2ProjectStore, cloudflareD1SchemaSql } from "./cloudflare";
export { callAiProvider, createAiProviderRequest } from "./aiProvider";
export { AuthSessionStore } from "./auth";
export { defaultAiPayloadPolicy } from "./aiPolicy";
export type { AiPayloadPolicy } from "./aiPolicy";
export type {
  AuthSessionRecord,
  AuthSessionStoreOptions,
  RandomBytesSource,
} from "./auth";
export type { CorsOptions } from "./cors";
export type { TilesProxyOptions } from "./tilesProxy";
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
