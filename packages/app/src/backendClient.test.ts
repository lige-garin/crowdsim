import { describe, expect, it } from "vitest";
import { createCrowdSimBackend } from "@crowdsim/backend";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { BackendClientError, createBackendClient } from "./backendClient";

function newClient() {
  const backend = createCrowdSimBackend();
  return createBackendClient({
    fetch: backend.fetch,
    baseUrl: "http://backend.local",
  });
}

describe("backendClient against the real in-process backend", () => {
  it("creates, lists, gets, updates a project and reads versions", async () => {
    const client = newClient();

    const created = await client.createProject({
      id: "p1",
      name: "Mall A",
      ownerId: "owner1",
      scene: bioCityDemoScene,
    });
    expect(created.id).toBe("p1");
    expect(created.version).toBeGreaterThanOrEqual(1);

    const list = await client.listProjects("owner1");
    expect(list.map((project) => project.id)).toContain("p1");

    const got = await client.getProject("p1");
    expect(got?.name).toBe("Mall A");

    const updated = await client.updateScene({
      projectId: "p1",
      actorId: "owner1",
      expectedVersion: created.version,
      scene: bioCityDemoScene,
    });
    expect(updated.version).toBeGreaterThan(created.version);

    const versions = await client.listVersions("p1");
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns null for a missing project", async () => {
    const client = newClient();
    expect(await client.getProject("does-not-exist")).toBeNull();
  });

  it("surfaces a version conflict as BackendClientError", async () => {
    const client = newClient();
    await client.createProject({
      id: "p2",
      name: "Mall B",
      ownerId: "owner2",
      scene: bioCityDemoScene,
    });

    await expect(
      client.updateScene({
        projectId: "p2",
        actorId: "owner2",
        expectedVersion: 99,
        scene: bioCityDemoScene,
      }),
    ).rejects.toBeInstanceOf(BackendClientError);
  });

  it("reads a usage/quota snapshot", async () => {
    const client = newClient();
    const usage = await client.getUsage("owner3");
    expect(usage.ownerId).toBe("owner3");
    expect(typeof usage.withinQuota).toBe("boolean");
  });
});
