import {
  ProjectVersionConflictError,
  type ProjectCreateInput,
  type ProjectRecord,
  type ProjectUpdateInput,
  type ShareLinkCreateInput,
  type ShareLinkRecord,
  type UsageMetric,
  type UsageSnapshot,
} from "@crowdsim/collab";
import { parseScene } from "@crowdsim/scene-schema";
import {
  all,
  artifactFromRow,
  cloneJson,
  cloneProject,
  first,
  projectFromRow,
  run,
  sanitizeArtifactId,
  sceneToJson,
  shareLinkFromRow,
  versionFromRow,
  type ProjectArtifactRow,
  type ProjectRow,
  type ProjectVersionRow,
  type ShareLinkRow,
  type UsageRow,
} from "./cloudflareRows";
import type {
  ProjectArtifactKind,
  ProjectArtifactRecord,
  ProjectArtifactReadResult,
  ProjectArtifactStore,
  ProjectArtifactWriteInput,
  ProjectStore,
} from "./storage";
export { cloudflareD1SchemaSql } from "./cloudflareSchema";

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export type D1PreparedStatementLike = {
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string };
    },
  ): Promise<unknown>;
};

export type R2ObjectBodyLike = {
  arrayBuffer?: () => Promise<ArrayBuffer>;
  body?: BodyInit | null;
};

const usageLimits: Record<UsageMetric, number> = {
  "experiment-runs": 500,
  projects: 25,
  "share-links": 100,
  "stored-replays": 50,
};

export class D1R2ProjectStore implements ProjectStore, ProjectArtifactStore {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly bucket?: R2BucketLike,
  ) {}

  async createProject(input: ProjectCreateInput) {
    const timestampIso = input.timestampIso ?? new Date().toISOString();
    const project: ProjectRecord = {
      createdAtIso: timestampIso,
      id: input.id,
      name: input.name,
      ownerId: input.ownerId,
      scene: parseScene(input.scene),
      updatedAtIso: timestampIso,
      version: 1,
    };

    await run(
      this.db,
      `INSERT INTO projects
       (id, owner_id, name, scene_json, version, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      project.id,
      project.ownerId,
      project.name,
      sceneToJson(project.scene),
      project.version,
      project.createdAtIso,
      project.updatedAtIso,
    );
    await this.recordVersion(project, input.ownerId, timestampIso);
    await this.audit(project, input.ownerId, "project-created", timestampIso);

    return cloneProject(project);
  }

  async getProject(projectId: string) {
    const row = await first<ProjectRow>(
      this.db,
      "SELECT * FROM projects WHERE id = ?",
      projectId,
    );

    return row ? projectFromRow(row) : null;
  }

  async listProjects(ownerId?: string) {
    const rows = ownerId
      ? await all<ProjectRow>(
          this.db,
          "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at_iso DESC",
          ownerId,
        )
      : await all<ProjectRow>(
          this.db,
          "SELECT * FROM projects ORDER BY updated_at_iso DESC",
        );

    return rows.map(projectFromRow);
  }

  async listProjectVersions(projectId: string) {
    const rows = await all<ProjectVersionRow>(
      this.db,
      "SELECT * FROM project_versions WHERE project_id = ? ORDER BY version ASC",
      projectId,
    );

    return rows.map(versionFromRow);
  }

  async updateScene(input: ProjectUpdateInput) {
    const project = await this.getProject(input.projectId);

    if (!project) {
      return null;
    }

    if (project.version !== input.expectedVersion) {
      throw new ProjectVersionConflictError(
        input.projectId,
        input.expectedVersion,
        project.version,
      );
    }

    const timestampIso = input.timestampIso ?? new Date().toISOString();
    const nextProject: ProjectRecord = {
      ...project,
      scene: parseScene(input.scene),
      updatedAtIso: timestampIso,
      version: project.version + 1,
    };

    await run(
      this.db,
      `UPDATE projects
       SET scene_json = ?, version = ?, updated_at_iso = ?
       WHERE id = ?`,
      sceneToJson(nextProject.scene),
      nextProject.version,
      nextProject.updatedAtIso,
      nextProject.id,
    );
    await this.recordVersion(nextProject, input.actorId, timestampIso);
    await this.audit(nextProject, input.actorId, "scene-updated", timestampIso);
    await run(
      this.db,
      `INSERT INTO collaboration_events
       (project_id, actor_id, kind, payload_json, at_iso)
       VALUES (?, ?, ?, ?, ?)`,
      input.projectId,
      input.actorId,
      "scene-updated",
      JSON.stringify({ version: nextProject.version }),
      timestampIso,
    );

    return cloneProject(nextProject);
  }

  async createReadOnlyShareLink(input: ShareLinkCreateInput) {
    const project = await this.getProject(input.projectId);

    if (!project) {
      return null;
    }

    const timestampIso = input.timestampIso ?? new Date().toISOString();
    const shareLink: ShareLinkRecord = {
      access: "read-only",
      createdAtIso: timestampIso,
      createdBy: input.actorId,
      expiresAtIso: input.expiresAtIso,
      projectId: input.projectId,
      token: input.token,
    };

    await run(
      this.db,
      `INSERT INTO share_links
       (token, project_id, created_by, created_at_iso, expires_at_iso)
       VALUES (?, ?, ?, ?, ?)`,
      shareLink.token,
      shareLink.projectId,
      shareLink.createdBy,
      shareLink.createdAtIso,
      shareLink.expiresAtIso ?? null,
    );
    await this.audit(project, input.actorId, "share-link-created", timestampIso);

    return cloneJson(shareLink);
  }

  async resolveShareLink(token: string, nowIso = new Date().toISOString()) {
    const row = await first<ShareLinkRow>(
      this.db,
      "SELECT * FROM share_links WHERE token = ?",
      token,
    );

    if (!row || (row.expires_at_iso && row.expires_at_iso < nowIso)) {
      return null;
    }

    const project = await this.getProject(row.project_id);

    return project
      ? {
          project,
          shareLink: shareLinkFromRow(row),
        }
      : null;
  }

  async recordUsage(ownerId: string, metric: UsageMetric, amount = 1) {
    await run(
      this.db,
      `INSERT INTO usage_counters (owner_id, metric, amount)
       VALUES (?, ?, ?)
       ON CONFLICT(owner_id, metric)
       DO UPDATE SET amount = amount + excluded.amount`,
      ownerId,
      metric,
      Math.max(0, amount),
    );

    return this.getUsageSnapshot(ownerId);
  }

  async getUsageSnapshot(ownerId: string): Promise<UsageSnapshot> {
    const rows = await all<UsageRow>(
      this.db,
      "SELECT metric, amount FROM usage_counters WHERE owner_id = ?",
      ownerId,
    );
    const manual = Object.fromEntries(
      rows.map((row) => [row.metric, row.amount]),
    ) as Partial<Record<UsageMetric, number>>;
    const usage: Record<UsageMetric, number> = {
      "experiment-runs": manual["experiment-runs"] ?? 0,
      projects: await this.countOwnerRows("projects", ownerId),
      "share-links": await this.countOwnerRows("share_links", ownerId),
      "stored-replays": manual["stored-replays"] ?? 0,
    };

    return {
      limits: { ...usageLimits },
      ownerId,
      usage,
      withinQuota: (Object.keys(usage) as UsageMetric[]).every(
        (metric) => usage[metric] <= usageLimits[metric],
      ),
    };
  }

  async putProjectArtifact(input: ProjectArtifactWriteInput) {
    const project = await this.getProject(input.projectId);

    if (!project) {
      return null;
    }

    if (!this.bucket) {
      throw new Error("R2 bucket is required for project artifacts");
    }

    const artifactId = sanitizeArtifactId(input.artifactId);
    const key = `projects/${project.id}/${input.kind}s/${artifactId}`;
    const record: ProjectArtifactRecord = {
      artifactId,
      bytes: input.body.byteLength,
      contentType: input.contentType,
      createdAtIso: input.timestampIso,
      createdBy: input.actorId,
      key,
      kind: input.kind,
      projectId: project.id,
    };

    await this.bucket.put(key, input.body, {
      customMetadata: {
        createdBy: record.createdBy,
        projectId: record.projectId,
      },
      httpMetadata: { contentType: record.contentType },
    });
    await run(
      this.db,
      `INSERT INTO project_artifacts
       (project_id, kind, artifact_id, r2_key, content_type, bytes,
        created_by, created_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      record.projectId,
      record.kind,
      record.artifactId,
      record.key,
      record.contentType,
      record.bytes,
      record.createdBy,
      record.createdAtIso,
    );

    if (input.kind === "replay") {
      await this.recordUsage(project.ownerId, "stored-replays");
    }

    return { ...record };
  }

  async getProjectArtifact(
    projectId: string,
    kind: ProjectArtifactKind,
    artifactId: string,
  ): Promise<ProjectArtifactReadResult | null> {
    if (!this.bucket) {
      throw new Error("R2 bucket is required for project artifacts");
    }

    const record = await this.getArtifactRecord(projectId, kind, artifactId);

    if (!record) {
      return null;
    }

    const object = await this.bucket.get(record.key);

    if (!object) {
      return null;
    }

    return {
      body: object.body ?? (object.arrayBuffer ? await object.arrayBuffer() : null),
      record,
    };
  }

  private async countOwnerRows(table: "projects" | "share_links", ownerId: string) {
    const sql =
      table === "projects"
        ? "SELECT COUNT(*) AS count FROM projects WHERE owner_id = ?"
        : `SELECT COUNT(*) AS count FROM share_links
           JOIN projects ON projects.id = share_links.project_id
           WHERE projects.owner_id = ?`;
    const row = await first<{ count: number }>(this.db, sql, ownerId);

    return Number(row?.count ?? 0);
  }

  private async getArtifactRecord(
    projectId: string,
    kind: ProjectArtifactKind,
    artifactId: string,
  ) {
    const row = await first<ProjectArtifactRow>(
      this.db,
      `SELECT * FROM project_artifacts
       WHERE project_id = ? AND kind = ? AND artifact_id = ?`,
      projectId,
      kind,
      sanitizeArtifactId(artifactId),
    );

    return row ? artifactFromRow(row) : null;
  }

  private async recordVersion(
    project: ProjectRecord,
    actorId: string,
    createdAtIso: string,
  ) {
    await run(
      this.db,
      `INSERT INTO project_versions
       (project_id, version, actor_id, scene_json, created_at_iso)
       VALUES (?, ?, ?, ?, ?)`,
      project.id,
      project.version,
      actorId,
      sceneToJson(project.scene),
      createdAtIso,
    );
  }

  private async audit(
    project: ProjectRecord,
    actorId: string,
    action: string,
    atIso: string,
  ) {
    await run(
      this.db,
      `INSERT INTO audit_log (project_id, version, actor_id, action, at_iso)
       VALUES (?, ?, ?, ?, ?)`,
      project.id,
      project.version,
      actorId,
      action,
      atIso,
    );
  }
}
