import { describe, expect, it } from "vitest";
import { createCrowdSimBackend } from "@crowdsim/backend";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { BackendClientError, createBackendClient } from "./backendClient";

function newClient() {
  const backend = createCrowdSimBackend({ allowUnauthenticatedLogin: true });
  return createBackendClient({
    fetch: backend.fetch,
    baseUrl: "http://backend.local",
  });
}

describe("backendClient against the real in-process backend", () => {
  it("creates, lists, gets, updates a project and reads versions", async () => {
    const client = newClient();
    const session = await client.login({ accountId: "owner1" });

    expect(session.account.id).toBe("owner1");

    const created = await client.createProject({
      id: "p1",
      name: "Mall A",
      scene: bioCityDemoScene,
    });
    expect(created.id).toBe("p1");
    expect(created.ownerId).toBe("owner1");
    expect(created.version).toBeGreaterThanOrEqual(1);

    const list = await client.listProjects("owner1");
    expect(list.map((project) => project.id)).toContain("p1");

    const got = await client.getProject("p1");
    expect(got?.name).toBe("Mall A");

    const updated = await client.updateScene({
      projectId: "p1",
      expectedVersion: created.version,
      scene: bioCityDemoScene,
    });
    expect(updated.version).toBeGreaterThan(created.version);

    const versions = await client.listVersions("p1");
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.every((version) => version.actorId === "owner1")).toBe(true);
  });

  it("returns null for a missing project", async () => {
    const client = newClient();
    await client.login({ accountId: "owner1" });
    expect(await client.getProject("does-not-exist")).toBeNull();
  });

  it("surfaces a version conflict as BackendClientError", async () => {
    const client = newClient();
    await client.login({ accountId: "owner2" });
    await client.createProject({
      id: "p2",
      name: "Mall B",
      scene: bioCityDemoScene,
    });

    await expect(
      client.updateScene({
        projectId: "p2",
        expectedVersion: 99,
        scene: bioCityDemoScene,
      }),
    ).rejects.toBeInstanceOf(BackendClientError);
  });

  it("reads a usage/quota snapshot", async () => {
    const client = newClient();
    await client.login({ accountId: "owner3" });
    const usage = await client.getUsage("owner3");
    expect(usage.ownerId).toBe("owner3");
    expect(typeof usage.withinQuota).toBe("boolean");
  });

  it("fails every data call until a session exists", async () => {
    const backend = createCrowdSimBackend({ allowUnauthenticatedLogin: true });
    const client = createBackendClient({
      fetch: backend.fetch,
      baseUrl: "http://backend.local",
    });

    await expect(
      client.createProject({ id: "p3", name: "Mall C", scene: bioCityDemoScene }),
    ).rejects.toMatchObject({ code: "auth-required", status: 401 });
    await expect(client.listProjects()).rejects.toBeInstanceOf(BackendClientError);

    await client.login({ accountId: "owner4" });
    await client.createProject({ id: "p3", name: "Mall C", scene: bioCityDemoScene });
    await client.logout();

    await expect(client.listProjects()).rejects.toMatchObject({ status: 401 });
  });

  it("never returns another account's project", async () => {
    const backend = createCrowdSimBackend({ allowUnauthenticatedLogin: true });
    const owner = createBackendClient({
      fetch: backend.fetch,
      baseUrl: "http://backend.local",
    });
    const intruder = createBackendClient({
      fetch: backend.fetch,
      baseUrl: "http://backend.local",
    });

    await owner.login({ accountId: "owner5" });
    await owner.createProject({
      id: "p-private",
      name: "Private",
      scene: bioCityDemoScene,
    });
    await intruder.login({ accountId: "intruder" });

    expect(await intruder.getProject("p-private")).toBeNull();
    expect(await intruder.listProjects("owner5")).toEqual([]);
    await expect(
      intruder.updateScene({
        projectId: "p-private",
        expectedVersion: 1,
        scene: bioCityDemoScene,
      }),
    ).rejects.toMatchObject({ code: "project-not-found", status: 404 });
    await expect(intruder.getUsage("owner5")).rejects.toMatchObject({ status: 404 });
  });
});
