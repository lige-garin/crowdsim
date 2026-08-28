import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  InMemoryProjectStore,
  ProjectAlreadyExistsError,
  ProjectVersionConflictError,
  UsageQuotaExceededError,
  createRandomShareToken,
} from "./index";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "collab-demo",
  name: "Collab demo",
  seed: 99,
  world: { width: 20, height: 10 },
  entrances: [
    {
      id: "entry",
      kind: "source",
      position: { x: 1, y: 5 },
      width: 2,
      arrivalRatePerMinute: 30,
    },
    {
      id: "exit",
      kind: "sink",
      position: { x: 19, y: 5 },
      width: 2,
    },
  ],
});

describe("InMemoryProjectStore", () => {
  it("creates, lists, and snapshots projects with audit entries", () => {
    const store = new InMemoryProjectStore();
    const project = store.createProject({
      id: "project-1",
      name: "Station test",
      ownerId: "user-1",
      scene,
      timestampIso: "2026-06-12T00:00:00.000Z",
    });

    expect(project.version).toBe(1);
    expect(store.getProject("project-1")?.scene.id).toBe("collab-demo");
    expect(store.listProjects("user-1")).toHaveLength(1);
    expect(store.listProjectVersions("project-1")).toMatchObject([
      {
        actorId: "user-1",
        projectId: "project-1",
        version: 1,
      },
    ]);
    expect(store.snapshot().auditLog).toEqual([
      {
        action: "project-created",
        actorId: "user-1",
        atIso: "2026-06-12T00:00:00.000Z",
        projectId: "project-1",
        version: 1,
      },
    ]);
  });

  it("updates scenes with optimistic version checks and collaboration events", () => {
    const store = new InMemoryProjectStore();
    store.createProject({
      id: "project-2",
      name: "Hospital test",
      ownerId: "user-1",
      scene,
      timestampIso: "2026-06-12T00:00:00.000Z",
    });

    const updated = store.updateScene({
      actorId: "user-2",
      expectedVersion: 1,
      projectId: "project-2",
      scene: { ...scene, name: "Updated demo" },
      timestampIso: "2026-06-12T00:01:00.000Z",
    });

    expect(updated?.version).toBe(2);
    expect(updated?.scene.name).toBe("Updated demo");
    expect(store.listProjectVersions("project-2").map((item) => item.version)).toEqual([
      1, 2,
    ]);
    expect(store.snapshot().versions).toHaveLength(2);
    expect(store.snapshot().events).toEqual([
      {
        actorId: "user-2",
        atIso: "2026-06-12T00:01:00.000Z",
        kind: "scene-updated",
        projectId: "project-2",
        version: 2,
      },
    ]);
  });

  it("rejects stale scene updates", () => {
    const store = new InMemoryProjectStore();
    store.createProject({
      id: "project-3",
      name: "Conflict test",
      ownerId: "user-1",
      scene,
    });

    expect(() =>
      store.updateScene({
        actorId: "user-2",
        expectedVersion: 99,
        projectId: "project-3",
        scene,
      }),
    ).toThrow(ProjectVersionConflictError);
  });

  it("creates read-only share links and tracks quota usage", () => {
    const store = new InMemoryProjectStore();
    store.createProject({
      id: "project-4",
      name: "Share test",
      ownerId: "user-1",
      scene,
      timestampIso: "2026-06-12T00:00:00.000Z",
    });

    const shareLink = store.createReadOnlyShareLink({
      actorId: "user-1",
      expiresAtIso: "2026-06-13T00:00:00.000Z",
      projectId: "project-4",
      timestampIso: "2026-06-12T00:01:00.000Z",
    });
    const token = shareLink?.token ?? "";

    store.recordUsage("user-1", "experiment-runs", 3);

    expect(shareLink).toMatchObject({
      access: "read-only",
      projectId: "project-4",
    });
    expect(store.resolveShareLink(token, "2026-06-12T12:00:00.000Z")?.project.id).toBe(
      "project-4",
    );
    expect(store.resolveShareLink(token, "2026-06-14T00:00:00.000Z")).toBe(null);
    expect(store.getUsageSnapshot("user-1")).toMatchObject({
      usage: {
        "experiment-runs": 3,
        projects: 1,
        "share-links": 1,
        "stored-replays": 0,
      },
      withinQuota: true,
    });
    expect(store.snapshot().shareLinks).toHaveLength(1);
  });

  it("mints unguessable share tokens instead of trusting the caller", () => {
    const store = new InMemoryProjectStore();
    store.createProject({
      id: "project-token",
      name: "Token test",
      ownerId: "user-1",
      scene,
    });

    const first = store.createReadOnlyShareLink({
      actorId: "user-1",
      projectId: "project-token",
    });
    const second = store.createReadOnlyShareLink({
      actorId: "user-1",
      projectId: "project-token",
    });

    expect(first?.token).not.toBe(second?.token);
    expect(first?.token).not.toContain("project-token");
    expect(first?.token).not.toContain("user-1");
    // 24 random bytes rendered as hex; anything shorter would be brute forceable.
    expect(first?.token.replace(/^csl_/, "")).toMatch(/^[0-9a-f]{48}$/);
    expect(new Set([...Array(200)].map(() => createRandomShareToken())).size).toBe(200);
  });

  it("refuses a share token collision instead of overwriting the existing link", () => {
    const store = new InMemoryProjectStore({ createShareToken: () => "fixed-token" });
    store.createProject({
      id: "project-collision",
      name: "Collision test",
      ownerId: "user-1",
      scene,
    });
    store.createReadOnlyShareLink({
      actorId: "user-1",
      projectId: "project-collision",
    });

    expect(() =>
      store.createReadOnlyShareLink({
        actorId: "user-1",
        projectId: "project-collision",
      }),
    ).toThrow(/unique share link token/i);
    expect(store.snapshot().shareLinks).toHaveLength(1);
  });

  it("rejects a duplicate project id instead of silently replacing the project", () => {
    const store = new InMemoryProjectStore();
    store.createProject({
      id: "project-dup",
      name: "Original",
      ownerId: "user-1",
      scene,
    });

    expect(() =>
      store.createProject({
        id: "project-dup",
        name: "Impostor",
        ownerId: "user-2",
        scene,
      }),
    ).toThrow(ProjectAlreadyExistsError);
    expect(store.getProject("project-dup")).toMatchObject({
      name: "Original",
      ownerId: "user-1",
    });
    expect(store.listProjectVersions("project-dup")).toHaveLength(1);
  });

  it("enforces quotas on project, share link, and scene writes", () => {
    const store = new InMemoryProjectStore({
      usageLimits: { projects: 1, "share-links": 1 },
    });
    const project = store.createProject({
      id: "project-quota",
      name: "Quota test",
      ownerId: "user-1",
      scene,
    });
    store.createReadOnlyShareLink({ actorId: "user-1", projectId: "project-quota" });

    expect(() =>
      store.createProject({
        id: "project-quota-2",
        name: "Over quota",
        ownerId: "user-1",
        scene,
      }),
    ).toThrow(UsageQuotaExceededError);
    expect(() =>
      store.createReadOnlyShareLink({ actorId: "user-1", projectId: "project-quota" }),
    ).toThrow(UsageQuotaExceededError);
    expect(() =>
      store.updateScene({
        actorId: "user-1",
        expectedVersion: project.version,
        projectId: "project-quota",
        scene,
      }),
    ).not.toThrow();
    expect(store.listProjects("user-1")).toHaveLength(1);
    expect(store.snapshot().shareLinks).toHaveLength(1);

    // A different owner still has headroom: quotas are per owner, not global.
    expect(() =>
      store.createProject({
        id: "project-quota-other",
        name: "Other owner",
        ownerId: "user-2",
        scene,
      }),
    ).not.toThrow();
  });

  it("blocks scene updates once the owner is over quota", () => {
    const store = new InMemoryProjectStore({ usageLimits: { "experiment-runs": 2 } });
    const project = store.createProject({
      id: "project-over",
      name: "Over quota",
      ownerId: "user-1",
      scene,
    });

    store.recordUsage("user-1", "experiment-runs", 5);

    expect(store.getUsageSnapshot("user-1").withinQuota).toBe(false);
    expect(() =>
      store.updateScene({
        actorId: "user-1",
        expectedVersion: project.version,
        projectId: "project-over",
        scene,
      }),
    ).toThrow(UsageQuotaExceededError);
    expect(store.getProject("project-over")?.version).toBe(1);
  });
});
