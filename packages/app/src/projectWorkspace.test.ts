import { describe, expect, it } from "vitest";
import { backendBlueprints, createDemoProjectWorkspace } from "./projectWorkspace";

describe("project workspace", () => {
  it("summarizes account, version history, share link, and quota", () => {
    const workspace = createDemoProjectWorkspace();

    expect(workspace.accountName).toBe("planner");
    expect(workspace.authSession).toMatchObject({
      active: true,
      tokenPreview: "csess_demo",
    });
    expect(workspace.currentVersion).toBe(2);
    expect(workspace.versionCount).toBe(2);
    expect(workspace.shareUrl).toBe("/share/demo-read-only");
    expect(workspace.quota.usage).toMatchObject({
      "experiment-runs": 18,
      projects: 1,
      "share-links": 1,
      "stored-replays": 2,
    });
    expect(workspace.quota.withinQuota).toBe(true);
    expect(workspace.auditActions).toContain("share-link-created");
    expect(workspace.backend.apiRoutes).toContain("/api/projects");
    expect(workspace.backend.apiRoutes).toContain("/api/auth/login");
    expect(workspace.backend.apiRoutes).toContain("/api/auth/session");
    expect(workspace.backend.apiRoutes).toContain("/share/:token");
    expect(workspace.backend.apiRoutes).toContain("/api/ai/:provider");
    expect(workspace.backend.apiRoutes).toContain("/api/tiles/google/*");
  });

  it("keeps Cloudflare and Supabase backend blueprints explicit", () => {
    expect(backendBlueprints.map((blueprint) => blueprint.id)).toEqual([
      "cloudflare-d1-r2",
      "supabase-storage",
    ]);
  });
});
