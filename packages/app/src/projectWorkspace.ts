import { InMemoryProjectStore, type UsageSnapshot } from "@crowdsim/collab";
import { demoScene } from "./demoScene";

export type BackendBlueprint = {
  apiRoutes: readonly string[];
  auth: string;
  id: string;
  label: string;
  objectStorage: string;
  relationalStore: string;
  shareRoute: string;
};

export type ProjectWorkspaceSummary = {
  accountName: string;
  authSession: {
    active: boolean;
    expiresAtIso: string;
    tokenPreview: string;
  };
  auditActions: readonly string[];
  backend: BackendBlueprint;
  currentVersion: number;
  projectName: string;
  quota: UsageSnapshot;
  shareUrl: string;
  versionCount: number;
};

export const backendBlueprints: readonly BackendBlueprint[] = [
  {
    apiRoutes: [
      "/api/auth/login",
      "/api/auth/session",
      "/api/projects",
      "/api/projects/:id/versions",
      "/share/:token",
      "/api/usage/:ownerId",
      "/api/ai/:provider",
      "/api/tiles/google/*",
    ],
    auth: "Supabase Auth or Clerk JWT",
    id: "cloudflare-d1-r2",
    label: "Cloudflare Workers + D1/R2",
    objectStorage: "R2 stores replay and report artifacts",
    relationalStore: "D1 stores projects, versions, share links, and usage",
    shareRoute: "/share/demo-read-only",
  },
  {
    apiRoutes: [
      "/api/auth/login",
      "/api/auth/session",
      "/api/projects",
      "/api/projects/:id/versions",
      "/share/:token",
      "/api/usage/:ownerId",
      "/api/ai/:provider",
      "/api/tiles/google/*",
    ],
    auth: "Supabase Auth",
    id: "supabase-storage",
    label: "Supabase Postgres + Storage",
    objectStorage: "Storage buckets keep replay files and PDF reports",
    relationalStore: "Postgres stores projects, versions, and quota events",
    shareRoute: "/share/demo-read-only",
  },
];

export function createDemoProjectWorkspace(): ProjectWorkspaceSummary {
  const store = new InMemoryProjectStore();
  const project = store.createProject({
    id: "workspace-demo",
    name: "Atrium evacuation review",
    ownerId: "planner",
    scene: demoScene,
    timestampIso: "2026-06-12T00:00:00.000Z",
  });
  const updatedProject = store.updateScene({
    actorId: "reviewer",
    expectedVersion: project.version,
    projectId: project.id,
    scene: { ...demoScene, name: "Atrium Demo Reviewed" },
    timestampIso: "2026-06-12T00:05:00.000Z",
  });
  const shareLink = store.createReadOnlyShareLink({
    actorId: "planner",
    projectId: project.id,
    timestampIso: "2026-06-12T00:06:00.000Z",
    token: "demo-read-only",
  });

  store.recordUsage(project.ownerId, "experiment-runs", 18);
  store.recordUsage(project.ownerId, "stored-replays", 2);

  const versions = store.listProjectVersions(project.id);
  const snapshot = store.snapshot();

  return {
    accountName: "planner",
    authSession: {
      active: true,
      expiresAtIso: "2026-06-12T08:00:00.000Z",
      tokenPreview: "csess_demo",
    },
    auditActions: snapshot.auditLog.map((entry) => entry.action),
    backend: backendBlueprints[0],
    currentVersion: updatedProject?.version ?? project.version,
    projectName: updatedProject?.name ?? project.name,
    quota: store.getUsageSnapshot(project.ownerId),
    shareUrl: shareLink ? `/share/${shareLink.token}` : "/share/unavailable",
    versionCount: versions.length,
  };
}
