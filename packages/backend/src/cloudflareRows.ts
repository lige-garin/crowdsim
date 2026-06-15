import type {
  ProjectRecord,
  ProjectVersionRecord,
  ShareLinkRecord,
  UsageMetric,
} from "@crowdsim/collab";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import type { D1DatabaseLike } from "./cloudflare";
import type { ProjectArtifactKind, ProjectArtifactRecord } from "./storage";

export type ProjectRow = {
  created_at_iso: string;
  id: string;
  name: string;
  owner_id: string;
  scene_json: string;
  updated_at_iso: string;
  version: number;
};

export type ProjectVersionRow = {
  actor_id: string;
  created_at_iso: string;
  project_id: string;
  scene_json: string;
  version: number;
};

export type ShareLinkRow = {
  created_at_iso: string;
  created_by: string;
  expires_at_iso: string | null;
  project_id: string;
  token: string;
};

export type UsageRow = {
  amount: number;
  metric: UsageMetric;
};

export type ProjectArtifactRow = {
  artifact_id: string;
  bytes: number;
  content_type: string;
  created_at_iso: string;
  created_by: string;
  kind: ProjectArtifactKind;
  project_id: string;
  r2_key: string;
};

export async function run(db: D1DatabaseLike, query: string, ...values: unknown[]) {
  await db
    .prepare(query)
    .bind(...values)
    .run();
}

export async function first<T>(
  db: D1DatabaseLike,
  query: string,
  ...values: unknown[]
) {
  return db
    .prepare(query)
    .bind(...values)
    .first<T>();
}

export async function all<T>(db: D1DatabaseLike, query: string, ...values: unknown[]) {
  const result = await db
    .prepare(query)
    .bind(...values)
    .all<T>();

  return result.results ?? [];
}

export function projectFromRow(row: ProjectRow): ProjectRecord {
  return {
    createdAtIso: row.created_at_iso,
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    scene: parseSceneJson(row.scene_json),
    updatedAtIso: row.updated_at_iso,
    version: row.version,
  };
}

export function versionFromRow(row: ProjectVersionRow): ProjectVersionRecord {
  return {
    actorId: row.actor_id,
    createdAtIso: row.created_at_iso,
    projectId: row.project_id,
    scene: parseSceneJson(row.scene_json),
    version: row.version,
  };
}

export function shareLinkFromRow(row: ShareLinkRow): ShareLinkRecord {
  return {
    access: "read-only",
    createdAtIso: row.created_at_iso,
    createdBy: row.created_by,
    expiresAtIso: row.expires_at_iso ?? undefined,
    projectId: row.project_id,
    token: row.token,
  };
}

export function artifactFromRow(row: ProjectArtifactRow): ProjectArtifactRecord {
  return {
    artifactId: row.artifact_id,
    bytes: row.bytes,
    contentType: row.content_type,
    createdAtIso: row.created_at_iso,
    createdBy: row.created_by,
    key: row.r2_key,
    kind: row.kind,
    projectId: row.project_id,
  };
}

function parseSceneJson(sceneJson: string): CrowdSimScene {
  return parseScene(JSON.parse(sceneJson));
}

export function sceneToJson(scene: CrowdSimScene) {
  return JSON.stringify(parseScene(scene));
}

export function cloneProject(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    scene: parseScene(JSON.parse(JSON.stringify(project.scene))),
  };
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sanitizeArtifactId(artifactId: string) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(artifactId)) {
    throw new Error("Project artifact id must be URL-safe");
  }

  return artifactId;
}
