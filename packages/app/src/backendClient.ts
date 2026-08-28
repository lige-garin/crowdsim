import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type {
  ProjectRecord,
  ProjectVersionRecord,
  UsageSnapshot,
} from "@crowdsim/collab";

/**
 * Transport-agnostic client for the CrowdSim backend.
 *
 * In production, pass a real `baseUrl` and the global `fetch` (the app talks to
 * a deployed backend over HTTP). In tests/dev, inject the in-process
 * `createCrowdSimBackend().fetch` so the same client drives the real backend
 * routes without a server. The client itself imports no backend code — only
 * shared `@crowdsim/collab` / `@crowdsim/scene-schema` types.
 *
 * Every data route needs a session, so callers must `login()` (or supply a
 * `token`) before anything else; ownership and actor identity are taken from
 * that session server-side and can no longer be passed in per request.
 */
export type BackendFetch = (request: Request) => Promise<Response>;

export type BackendClientOptions = {
  fetch?: BackendFetch;
  baseUrl?: string;
  token?: string;
};

export type BackendSession = {
  account: {
    displayName: string;
    id: string;
  };
  expiresAtIso: string;
  token: string;
};

export type LoginInput = {
  accountId: string;
  credential?: string;
  displayName?: string;
};

export type CreateProjectInput = {
  id: string;
  name: string;
  scene: CrowdSimScene;
};

export type UpdateSceneInput = {
  projectId: string;
  expectedVersion: number;
  scene: CrowdSimScene;
};

export type BackendClient = {
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  getProject(id: string): Promise<ProjectRecord | null>;
  getUsage(ownerId: string): Promise<UsageSnapshot>;
  listProjects(ownerId?: string): Promise<ProjectRecord[]>;
  listVersions(projectId: string): Promise<ProjectVersionRecord[]>;
  login(input: LoginInput): Promise<BackendSession>;
  logout(): Promise<void>;
  setToken(token: string | null): void;
  updateScene(input: UpdateSceneInput): Promise<ProjectRecord>;
};

export class BackendClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(`backend ${status}: ${code}`);
    this.name = "BackendClientError";
  }
}

export function createBackendClient(options: BackendClientOptions = {}): BackendClient {
  const doFetch: BackendFetch =
    options.fetch ?? ((request) => globalThis.fetch(request));
  const baseUrl = (options.baseUrl ?? "http://localhost").replace(/\/+$/, "");
  let sessionToken = options.token ?? null;

  async function send(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<Response> {
    const hasBody = init?.body !== undefined;
    return doFetch(
      new Request(`${baseUrl}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          ...(hasBody ? { "content-type": "application/json" } : {}),
          ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: hasBody ? JSON.stringify(init?.body) : undefined,
      }),
    );
  }

  async function unwrap<T>(
    response: Response,
    pick: (data: Record<string, unknown>) => T,
  ): Promise<T> {
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new BackendClientError(
        response.status,
        typeof data.error === "string" ? data.error : "backend-error",
        data,
      );
    }
    return pick(data);
  }

  return {
    async login(input) {
      const response = await send("/api/auth/login", { method: "POST", body: input });
      const session = await unwrap(response, (data) => data.session as BackendSession);
      sessionToken = session.token;
      return session;
    },
    async logout() {
      const response = await send("/api/auth/logout", { method: "POST" });
      sessionToken = null;
      await unwrap(response, () => null);
    },
    setToken(token) {
      sessionToken = token;
    },
    async createProject(input) {
      const response = await send("/api/projects", { method: "POST", body: input });
      return unwrap(response, (data) => data.project as ProjectRecord);
    },
    async listProjects(ownerId) {
      const query = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : "";
      const response = await send(`/api/projects${query}`);
      return unwrap(response, (data) => data.projects as ProjectRecord[]);
    },
    async getProject(id) {
      const response = await send(`/api/projects/${encodeURIComponent(id)}`);
      if (response.status === 404) {
        return null;
      }
      return unwrap(response, (data) => data.project as ProjectRecord);
    },
    async updateScene(input) {
      const response = await send(
        `/api/projects/${encodeURIComponent(input.projectId)}/scene`,
        {
          method: "PUT",
          body: {
            expectedVersion: input.expectedVersion,
            scene: input.scene,
          },
        },
      );
      return unwrap(response, (data) => data.project as ProjectRecord);
    },
    async listVersions(projectId) {
      const response = await send(
        `/api/projects/${encodeURIComponent(projectId)}/versions`,
      );
      return unwrap(response, (data) => data.versions as ProjectVersionRecord[]);
    },
    async getUsage(ownerId) {
      const response = await send(`/api/usage/${encodeURIComponent(ownerId)}`);
      return unwrap(response, (data) => data.usage as UsageSnapshot);
    },
  };
}
