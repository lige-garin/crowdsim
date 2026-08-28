import { InMemoryProjectStore } from "@crowdsim/collab";
import { describe, expect, it } from "vitest";
import { createCrowdSimBackend } from "./index";
import {
  aiPayload,
  login,
  requestJson,
  scene,
  type ConflictPayload,
  type ErrorPayload,
  type ProjectPayload,
  type ProjectsPayload,
  type QuotaPayload,
  type SharePayload,
  type ShareResolvePayload,
  type UsagePayload,
  type VersionsPayload,
} from "./backendTestUtils";

describe("CrowdSim backend project routes", () => {
  it("rejects every data route without a valid session", async () => {
    const backend = createCrowdSimBackend();
    const routes: { body?: unknown; method: string; path: string }[] = [
      { body: { id: "p", name: "P", scene }, method: "POST", path: "/api/projects" },
      { method: "GET", path: "/api/projects" },
      { method: "GET", path: "/api/projects/project-1" },
      {
        body: { expectedVersion: 1, scene },
        method: "PUT",
        path: "/api/projects/project-1/scene",
      },
      { method: "GET", path: "/api/projects/project-1/versions" },
      { body: {}, method: "POST", path: "/api/projects/project-1/share-links" },
      { method: "GET", path: "/api/usage/planner" },
      {
        body: { metric: "experiment-runs" },
        method: "POST",
        path: "/api/usage/planner",
      },
      { body: { payload: aiPayload }, method: "POST", path: "/api/ai/anthropic" },
      { method: "GET", path: "/api/tiles/google/tileset.json" },
    ];

    for (const route of routes) {
      const response = await requestJson<ErrorPayload>(backend.fetch, route.path, {
        body: route.body,
        method: route.method,
      });

      expect({ path: route.path, status: response.status }).toEqual({
        path: route.path,
        status: 401,
      });
      expect(response.body.error).toBe("auth-required");
    }

    const stale = await requestJson<ErrorPayload>(backend.fetch, "/api/projects", {
      token: "csess_00000000000000000000000000000000",
    });
    expect(stale.status).toBe(401);
  });

  it("serves projects, versions, share links, and quota through HTTP", async () => {
    const backend = createCrowdSimBackend({
      nowIso: () => "2026-06-12T00:00:00.000Z",
    });
    const token = await login(backend.fetch, "planner");

    const created = await requestJson<ProjectPayload>(backend.fetch, "/api/projects", {
      body: {
        id: "project-1",
        name: "Station Review",
        scene,
      },
      method: "POST",
      token,
    });

    expect(created.status).toBe(201);
    expect(created.body.project.version).toBe(1);
    expect(created.body.project.ownerId).toBe("planner");

    const updated = await requestJson<ProjectPayload>(
      backend.fetch,
      "/api/projects/project-1/scene",
      {
        body: {
          expectedVersion: 1,
          scene: { ...scene, name: "Backend Demo Reviewed" },
        },
        method: "PUT",
        token,
      },
    );

    expect(updated.status).toBe(200);
    expect(updated.body.project.version).toBe(2);

    const versions = await requestJson<VersionsPayload>(
      backend.fetch,
      "/api/projects/project-1/versions",
      { token },
    );
    expect(versions.body.versions.map((version) => version.version)).toEqual([1, 2]);
    // The actor recorded for the update is the session account, never a body field.
    expect(versions.body.versions.map((version) => version.actorId)).toEqual([
      "planner",
      "planner",
    ]);

    const share = await requestJson<SharePayload>(
      backend.fetch,
      "/api/projects/project-1/share-links",
      {
        body: {},
        method: "POST",
        token,
      },
    );
    expect(share.status).toBe(201);
    expect(share.body.shareLink.access).toBe("read-only");

    const resolved = await requestJson<ShareResolvePayload>(
      backend.fetch,
      `/share/${share.body.shareLink.token}`,
    );
    expect(resolved.body.project.id).toBe("project-1");
    expect(resolved.body.shareLink.token).toBe(share.body.shareLink.token);

    const usage = await requestJson<UsagePayload>(backend.fetch, "/api/usage/planner", {
      body: {
        amount: 7,
        metric: "experiment-runs",
      },
      method: "POST",
      token,
    });
    expect(usage.body.usage.usage).toMatchObject({
      "experiment-runs": 7,
      projects: 1,
      "share-links": 1,
    });
    expect(usage.body.usage.withinQuota).toBe(true);
  });

  it("hides other accounts' projects behind a 404", async () => {
    const backend = createCrowdSimBackend();
    const ownerToken = await login(backend.fetch, "planner");
    const intruderToken = await login(backend.fetch, "intruder");

    await requestJson(backend.fetch, "/api/projects", {
      body: { id: "project-private", name: "Private", scene },
      method: "POST",
      token: ownerToken,
    });

    const read = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects/project-private",
      { token: intruderToken },
    );
    const write = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects/project-private/scene",
      {
        body: { expectedVersion: 1, scene: { ...scene, name: "Hijacked" } },
        method: "PUT",
        token: intruderToken,
      },
    );
    const versions = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects/project-private/versions",
      { token: intruderToken },
    );
    const share = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects/project-private/share-links",
      { body: {}, method: "POST", token: intruderToken },
    );
    const listing = await requestJson<ProjectsPayload>(
      backend.fetch,
      "/api/projects?ownerId=planner",
      { token: intruderToken },
    );
    const usage = await requestJson<ErrorPayload>(backend.fetch, "/api/usage/planner", {
      token: intruderToken,
    });
    const ownerRead = await requestJson<ProjectPayload>(
      backend.fetch,
      "/api/projects/project-private",
      { token: ownerToken },
    );

    expect([read.status, write.status, versions.status, share.status]).toEqual([
      404, 404, 404, 404,
    ]);
    expect(read.body.error).toBe("project-not-found");
    expect(listing.body.projects).toEqual([]);
    expect(usage.status).toBe(404);
    expect(ownerRead.body.project.name).toBe("Private");
    expect(ownerRead.body.project.version).toBe(1);
  });

  it("files projects under the session account, not the request body", async () => {
    const backend = createCrowdSimBackend();
    const token = await login(backend.fetch, "planner");
    const victimToken = await login(backend.fetch, "victim");

    const created = await requestJson<ProjectPayload>(backend.fetch, "/api/projects", {
      body: {
        id: "project-spoof",
        name: "Spoofed",
        ownerId: "victim",
        scene,
      },
      method: "POST",
      token,
    });
    const victimListing = await requestJson<ProjectsPayload>(
      backend.fetch,
      "/api/projects",
      { token: victimToken },
    );

    expect(created.body.project.ownerId).toBe("planner");
    expect(victimListing.body.projects).toEqual([]);
  });

  it("mints share tokens server-side and keeps the shared payload read-only", async () => {
    const backend = createCrowdSimBackend();
    const token = await login(backend.fetch, "planner");

    await requestJson(backend.fetch, "/api/projects", {
      body: { id: "project-share", name: "Shared", scene },
      method: "POST",
      token,
    });

    const share = await requestJson<SharePayload>(
      backend.fetch,
      "/api/projects/project-share/share-links",
      {
        body: { token: "attacker-chosen-token" },
        method: "POST",
        token,
      },
    );
    const forged = await requestJson<ErrorPayload>(
      backend.fetch,
      "/share/attacker-chosen-token",
    );
    const resolved = await requestJson<ShareResolvePayload>(
      backend.fetch,
      `/share/${share.body.shareLink.token}`,
    );

    expect(share.body.shareLink.token).not.toBe("attacker-chosen-token");
    expect(forged.status).toBe(404);
    expect(resolved.status).toBe(200);
    expect(resolved.body.project.id).toBe("project-share");
    expect(resolved.body.project).not.toHaveProperty("ownerId");
    expect(resolved.body.shareLink).not.toHaveProperty("createdBy");
    expect(JSON.stringify(resolved.body)).not.toContain("planner");
  });

  it("returns 409 for stale project updates and duplicate project ids", async () => {
    const backend = createCrowdSimBackend();
    const token = await login(backend.fetch, "planner");
    const intruderToken = await login(backend.fetch, "intruder");

    await requestJson(backend.fetch, "/api/projects", {
      body: {
        id: "project-conflict",
        name: "Conflict",
        scene,
      },
      method: "POST",
      token,
    });

    const conflict = await requestJson<ConflictPayload>(
      backend.fetch,
      "/api/projects/project-conflict/scene",
      {
        body: {
          expectedVersion: 9,
          scene,
        },
        method: "PUT",
        token,
      },
    );
    const duplicate = await requestJson<ErrorPayload>(backend.fetch, "/api/projects", {
      body: { id: "project-conflict", name: "Impostor", scene },
      method: "POST",
      token: intruderToken,
    });
    const owner = await requestJson<ProjectPayload>(
      backend.fetch,
      "/api/projects/project-conflict",
      { token },
    );

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      actualVersion: 1,
      error: "version-conflict",
      expectedVersion: 9,
      projectId: "project-conflict",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("project-already-exists");
    expect(owner.body.project.name).toBe("Conflict");
  });

  it("returns 429 once the project quota is exhausted", async () => {
    const backend = createCrowdSimBackend({
      store: new InMemoryProjectStore({ usageLimits: { projects: 1 } }),
    });
    const token = await login(backend.fetch, "planner");

    const first = await requestJson<ProjectPayload>(backend.fetch, "/api/projects", {
      body: { id: "project-a", name: "A", scene },
      method: "POST",
      token,
    });
    const second = await requestJson<QuotaPayload>(backend.fetch, "/api/projects", {
      body: { id: "project-b", name: "B", scene },
      method: "POST",
      token,
    });
    const listing = await requestJson<ProjectsPayload>(backend.fetch, "/api/projects", {
      token,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({
      error: "usage-quota-exceeded",
      metric: "projects",
    });
    expect(listing.body.projects.map((project) => project.id)).toEqual(["project-a"]);
  });

  it("rejects unknown quota metrics and missing projects", async () => {
    const backend = createCrowdSimBackend();
    const token = await login(backend.fetch, "planner");

    const missingProject = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects/missing-project",
      { token },
    );
    const invalidMetric = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/usage/planner",
      {
        body: { metric: "tokens" },
        method: "POST",
        token,
      },
    );

    expect(missingProject.status).toBe(404);
    expect(missingProject.body.error).toBe("project-not-found");
    expect(invalidMetric.status).toBe(400);
    expect(invalidMetric.body.message).toContain("Unknown usage metric");
  });
});
