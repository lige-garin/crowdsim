import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { InMemoryProjectStore, ProjectVersionConflictError } from "./index";

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
      token: "share-token",
    });

    store.recordUsage("user-1", "experiment-runs", 3);

    expect(shareLink).toMatchObject({
      access: "read-only",
      projectId: "project-4",
      token: "share-token",
    });
    expect(
      store.resolveShareLink("share-token", "2026-06-12T12:00:00.000Z")?.project.id,
    ).toBe("project-4");
    expect(store.resolveShareLink("share-token", "2026-06-14T00:00:00.000Z")).toBe(
      null,
    );
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
});
