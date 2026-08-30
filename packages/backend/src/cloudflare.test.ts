import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { createTestBackend } from "./backendTestUtils";
import { D1R2ProjectStore, cloudflareD1SchemaSql } from "./index";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  R2BucketLike,
  R2ObjectBodyLike,
} from "./cloudflare";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "cloudflare-demo",
  name: "Cloudflare Demo",
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
});

describe("Cloudflare D1/R2 backend adapter", () => {
  it("publishes D1 schema for projects, versions, shares, usage, and artifacts", () => {
    expect(cloudflareD1SchemaSql).toContain("CREATE TABLE IF NOT EXISTS projects");
    expect(cloudflareD1SchemaSql).toContain("project_versions");
    expect(cloudflareD1SchemaSql).toContain("share_links");
    expect(cloudflareD1SchemaSql).toContain("usage_counters");
    expect(cloudflareD1SchemaSql).toContain("project_artifacts");
  });

  it("persists project versions and share links through D1", async () => {
    const store = new D1R2ProjectStore(new FakeD1Database());
    const created = await store.createProject({
      id: "project-d1",
      name: "D1 Project",
      ownerId: "planner",
      scene,
      timestampIso: "2026-06-12T00:00:00.000Z",
    });
    const updated = await store.updateScene({
      actorId: "reviewer",
      expectedVersion: 1,
      projectId: "project-d1",
      scene: { ...scene, name: "D1 Project Reviewed" },
      timestampIso: "2026-06-12T00:05:00.000Z",
    });
    const shareLink = await store.createReadOnlyShareLink({
      actorId: "planner",
      projectId: "project-d1",
      timestampIso: "2026-06-12T00:06:00.000Z",
    });

    expect(created.version).toBe(1);
    expect(updated?.version).toBe(2);
    expect(await store.listProjectVersions("project-d1")).toHaveLength(2);
    expect(shareLink?.access).toBe("read-only");
    expect(shareLink?.token).toMatch(/^csl_[0-9a-f]{48}$/);
    expect(await store.resolveShareLink(shareLink?.token ?? "")).toMatchObject({
      project: { id: "project-d1" },
    });
    await expect(
      store.updateScene({
        actorId: "reviewer",
        expectedVersion: 1,
        projectId: "project-d1",
        scene,
      }),
    ).rejects.toMatchObject({ actualVersion: 2 });
  });

  it("stores replay artifacts in R2 and exposes them through HTTP", async () => {
    const d1 = new FakeD1Database();
    const r2 = new FakeR2Bucket();
    const store = new D1R2ProjectStore(d1, r2);
    const backend = createTestBackend({
      artifacts: store,
      nowIso: () => "2026-06-12T00:00:00.000Z",
      store,
    });

    const token = await login(backend.fetch, "planner");

    await requestJson(backend.fetch, "/api/projects", {
      body: {
        id: "project-artifact",
        name: "Artifact Project",
        scene,
      },
      method: "POST",
      token,
    });

    const uploaded = await backend.fetch(
      new Request(
        "https://crowdsim.local/api/projects/project-artifact/artifacts/replay/run-1.csr",
        {
          body: new TextEncoder().encode("packed-replay"),
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/vnd.crowdsim.replay",
            "x-crowdsim-actor": "impostor",
          },
          method: "POST",
        },
      ),
    );
    const uploadJson = (await uploaded.json()) as ArtifactPayload;
    const downloaded = await backend.fetch(
      new Request(
        "https://crowdsim.local/api/projects/project-artifact/artifacts/replay/run-1.csr",
        { headers: { authorization: `Bearer ${token}` } },
      ),
    );
    const usage = await requestJson<UsagePayload>(backend.fetch, "/api/usage/planner", {
      token,
    });

    expect(uploaded.status).toBe(201);
    expect(uploadJson.artifact.key).toBe("projects/project-artifact/replays/run-1.csr");
    expect(uploadJson.artifact.createdBy).toBe("planner");
    expect(r2.objects.has(uploadJson.artifact.key)).toBe(true);
    expect(downloaded.headers.get("x-crowdsim-artifact-key")).toBe(
      uploadJson.artifact.key,
    );
    expect(await downloaded.text()).toBe("packed-replay");
    expect(usage.body.usage.usage["stored-replays"]).toBe(1);
  });

  it("keeps D1-backed artifacts away from other accounts", async () => {
    const store = new D1R2ProjectStore(new FakeD1Database(), new FakeR2Bucket());
    const backend = createTestBackend({
      artifacts: store,
      nowIso: () => "2026-06-12T00:00:00.000Z",
      store,
    });
    const ownerToken = await login(backend.fetch, "planner");
    const intruderToken = await login(backend.fetch, "intruder");

    await requestJson(backend.fetch, "/api/projects", {
      body: { id: "project-private", name: "Private", scene },
      method: "POST",
      token: ownerToken,
    });
    await backend.fetch(
      new Request(
        "https://crowdsim.local/api/projects/project-private/artifacts/replay/run-1.csr",
        {
          body: new TextEncoder().encode("packed-replay"),
          headers: { authorization: `Bearer ${ownerToken}` },
          method: "POST",
        },
      ),
    );

    const intruderRead = await backend.fetch(
      new Request(
        "https://crowdsim.local/api/projects/project-private/artifacts/replay/run-1.csr",
        { headers: { authorization: `Bearer ${intruderToken}` } },
      ),
    );
    const anonymousRead = await backend.fetch(
      new Request(
        "https://crowdsim.local/api/projects/project-private/artifacts/replay/run-1.csr",
      ),
    );

    expect(intruderRead.status).toBe(404);
    expect(anonymousRead.status).toBe(401);
    expect(await intruderRead.text()).not.toContain("packed-replay");
  });
});

async function login(
  fetchHandler: (request: Request) => Promise<Response>,
  accountId: string,
) {
  const response = await requestJson<{ session: { token: string } }>(
    fetchHandler,
    "/api/auth/login",
    { body: { accountId }, method: "POST" },
  );

  return response.body.session.token;
}

type ArtifactPayload = {
  artifact: {
    createdBy: string;
    key: string;
  };
};

type UsagePayload = {
  usage: {
    usage: Record<string, number>;
  };
};

class FakeD1Database implements D1DatabaseLike {
  artifacts = new Map<string, Record<string, unknown>>();
  projects = new Map<string, Record<string, unknown>>();
  shareLinks = new Map<string, Record<string, unknown>>();
  usage = new Map<string, number>();
  versions: Record<string, unknown>[] = [];

  prepare(query: string): D1PreparedStatementLike {
    return new FakeD1Statement(this, query);
  }
}

class FakeD1Statement implements D1PreparedStatementLike {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const sql = normalizeSql(this.query);

    if (sql.startsWith("INSERT INTO projects")) {
      const [id, ownerId, name, sceneJson, version, createdAt, updatedAt] = this.values;
      this.db.projects.set(String(id), {
        created_at_iso: createdAt,
        id,
        name,
        owner_id: ownerId,
        scene_json: sceneJson,
        updated_at_iso: updatedAt,
        version,
      });
    } else if (sql.startsWith("UPDATE projects")) {
      const [sceneJson, version, updatedAt, id] = this.values;
      const project = this.db.projects.get(String(id));
      this.db.projects.set(String(id), {
        ...project,
        scene_json: sceneJson,
        updated_at_iso: updatedAt,
        version,
      });
    } else if (sql.startsWith("INSERT INTO project_versions")) {
      const [projectId, version, actorId, sceneJson, createdAt] = this.values;
      this.db.versions.push({
        actor_id: actorId,
        created_at_iso: createdAt,
        project_id: projectId,
        scene_json: sceneJson,
        version,
      });
    } else if (sql.startsWith("INSERT INTO share_links")) {
      const [token, projectId, createdBy, createdAt, expiresAt] = this.values;
      this.db.shareLinks.set(String(token), {
        created_at_iso: createdAt,
        created_by: createdBy,
        expires_at_iso: expiresAt,
        project_id: projectId,
        token,
      });
    } else if (sql.startsWith("INSERT INTO usage_counters")) {
      const [ownerId, metric, amount] = this.values.map(String);
      const key = `${ownerId}:${metric}`;
      this.db.usage.set(key, (this.db.usage.get(key) ?? 0) + Number(amount));
    } else if (sql.startsWith("INSERT INTO project_artifacts")) {
      const [projectId, kind, artifactId, key, contentType, bytes, by, at] =
        this.values;
      this.db.artifacts.set(`${projectId}:${kind}:${artifactId}`, {
        artifact_id: artifactId,
        bytes,
        content_type: contentType,
        created_at_iso: at,
        created_by: by,
        kind,
        project_id: projectId,
        r2_key: key,
      });
    }

    return { success: true };
  }

  async first<T>() {
    const sql = normalizeSql(this.query);

    if (sql === "SELECT * FROM projects WHERE id = ?") {
      return (this.db.projects.get(String(this.values[0])) ?? null) as T | null;
    }

    if (sql === "SELECT * FROM share_links WHERE token = ?") {
      return (this.db.shareLinks.get(String(this.values[0])) ?? null) as T | null;
    }

    if (sql.startsWith("SELECT COUNT(*) AS count FROM projects")) {
      return { count: this.countProjects(String(this.values[0])) } as T;
    }

    if (sql.startsWith("SELECT COUNT(*) AS count FROM share_links")) {
      return { count: this.countShareLinks(String(this.values[0])) } as T;
    }

    if (sql.startsWith("SELECT * FROM project_artifacts")) {
      const [projectId, kind, artifactId] = this.values.map(String);
      return (this.db.artifacts.get(`${projectId}:${kind}:${artifactId}`) ??
        null) as T | null;
    }

    return null;
  }

  async all<T>() {
    const sql = normalizeSql(this.query);

    if (sql.startsWith("SELECT * FROM project_versions")) {
      const projectId = String(this.values[0]);
      return {
        results: this.db.versions.filter(
          (version) => version.project_id === projectId,
        ) as T[],
      };
    }

    if (sql.startsWith("SELECT metric, amount FROM usage_counters")) {
      const ownerId = String(this.values[0]);
      const results = [...this.db.usage.entries()]
        .filter(([key]) => key.startsWith(`${ownerId}:`))
        .map(([key, amount]) => ({ amount, metric: key.split(":")[1] }));
      return { results: results as T[] };
    }

    if (sql.startsWith("SELECT * FROM projects WHERE owner_id")) {
      const ownerId = String(this.values[0]);
      return {
        results: [...this.db.projects.values()].filter(
          (project) => project.owner_id === ownerId,
        ) as T[],
      };
    }

    if (sql.startsWith("SELECT * FROM projects ORDER BY")) {
      return { results: [...this.db.projects.values()] as T[] };
    }

    return { results: [] };
  }

  private countProjects(ownerId: string) {
    return [...this.db.projects.values()].filter(
      (project) => project.owner_id === ownerId,
    ).length;
  }

  private countShareLinks(ownerId: string) {
    return [...this.db.shareLinks.values()].filter((shareLink) => {
      const project = this.db.projects.get(String(shareLink.project_id));
      return project?.owner_id === ownerId;
    }).length;
  }
}

class FakeR2Bucket implements R2BucketLike {
  objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();

  async put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    this.objects.set(key, {
      body: value.slice(0),
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    const object = this.objects.get(key);

    return object
      ? {
          arrayBuffer: async () => object.body.slice(0),
        }
      : null;
  }
}

async function requestJson<TBody>(
  fetchHandler: (request: Request) => Promise<Response>,
  path: string,
  options: { body?: unknown; method?: string; token?: string } = {},
) {
  const response = await fetchHandler(
    new Request(`https://crowdsim.local${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      method: options.method ?? "GET",
    }),
  );

  return {
    body: (await response.json()) as TBody,
    status: response.status,
  };
}

function normalizeSql(query: string) {
  return query.replace(/\s+/g, " ").trim();
}
