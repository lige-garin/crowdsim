import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

export type ProjectRecord = {
  createdAtIso: string;
  id: string;
  name: string;
  ownerId: string;
  scene: CrowdSimScene;
  updatedAtIso: string;
  version: number;
};

export type ProjectVersionRecord = {
  actorId: string;
  createdAtIso: string;
  projectId: string;
  scene: CrowdSimScene;
  version: number;
};

export type CollaborationEvent =
  | {
      actorId: string;
      atIso: string;
      kind: "presence";
      projectId: string;
      selectionId: string | null;
    }
  | {
      actorId: string;
      atIso: string;
      kind: "scene-updated";
      projectId: string;
      version: number;
    }
  | {
      actorId: string;
      atIso: string;
      kind: "comment";
      message: string;
      projectId: string;
      targetId: string | null;
    };

export type AuditLogEntry = {
  action: string;
  actorId: string;
  atIso: string;
  projectId: string;
  version: number;
};

export type ShareLinkRecord = {
  access: "read-only";
  createdAtIso: string;
  createdBy: string;
  expiresAtIso?: string;
  projectId: string;
  token: string;
};

/**
 * Share tokens are minted by the store, never by the caller: a caller-chosen
 * token lets an attacker pick a guessable value (or overwrite someone else's
 * link) for a URL that grants anonymous read access.
 */
export type ShareLinkCreateInput = {
  actorId: string;
  expiresAtIso?: string;
  projectId: string;
  timestampIso?: string;
};

export type UsageMetric =
  | "ai-calls"
  | "experiment-runs"
  | "projects"
  | "share-links"
  | "stored-replays"
  | "tiles-requests";

export type UsageSnapshot = {
  limits: Record<UsageMetric, number>;
  ownerId: string;
  usage: Record<UsageMetric, number>;
  withinQuota: boolean;
};

export type ProjectCreateInput = {
  id: string;
  name: string;
  ownerId: string;
  scene: CrowdSimScene;
  timestampIso?: string;
};

export type ProjectUpdateInput = {
  actorId: string;
  expectedVersion: number;
  projectId: string;
  scene: CrowdSimScene;
  timestampIso?: string;
};

export type ProjectStoreSnapshot = {
  auditLog: AuditLogEntry[];
  events: CollaborationEvent[];
  projects: ProjectRecord[];
  shareLinks: ShareLinkRecord[];
  versions: ProjectVersionRecord[];
};

export type ProjectStoreOptions = {
  createShareToken?: () => string;
  usageLimits?: Partial<Record<UsageMetric, number>>;
};

export const defaultUsageLimits: Record<UsageMetric, number> = {
  "ai-calls": 200,
  "experiment-runs": 500,
  projects: 25,
  "share-links": 100,
  "stored-replays": 50,
  "tiles-requests": 20000,
};

export class ProjectVersionConflictError extends Error {
  constructor(
    readonly projectId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Project ${projectId} version conflict: expected ${expectedVersion}, got ${actualVersion}`,
    );
    this.name = "ProjectVersionConflictError";
  }
}

export class ProjectAlreadyExistsError extends Error {
  constructor(readonly projectId: string) {
    super(`Project ${projectId} already exists`);
    this.name = "ProjectAlreadyExistsError";
  }
}

export class UsageQuotaExceededError extends Error {
  constructor(
    readonly ownerId: string,
    readonly metric: UsageMetric,
    readonly limit: number,
  ) {
    super(`Owner ${ownerId} exceeded the ${metric} quota of ${limit}`);
    this.name = "UsageQuotaExceededError";
  }
}

/**
 * Minted with a CSPRNG rather than a counter/hash so a share URL cannot be
 * guessed from another link or from the project id it points at.
 */
export function createRandomShareToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  const randomSource = globalScope.crypto;

  if (!randomSource) {
    throw new Error("A Web Crypto implementation is required for share tokens");
  }

  randomSource.getRandomValues(bytes);

  return `csl_${toHex(bytes)}`;
}

export function findExceededUsageMetric(snapshot: UsageSnapshot) {
  return (Object.keys(snapshot.usage) as UsageMetric[]).find(
    (metric) => snapshot.usage[metric] > snapshot.limits[metric],
  );
}

export class InMemoryProjectStore {
  private readonly auditLog: AuditLogEntry[] = [];
  private readonly createShareToken: () => string;
  private readonly events: CollaborationEvent[] = [];
  private readonly limits: Record<UsageMetric, number>;
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly shareLinks = new Map<string, ShareLinkRecord>();
  private readonly usage = new Map<string, Partial<Record<UsageMetric, number>>>();
  private readonly versions = new Map<string, ProjectVersionRecord[]>();

  constructor(options: ProjectStoreOptions = {}) {
    this.createShareToken = options.createShareToken ?? createRandomShareToken;
    this.limits = { ...defaultUsageLimits, ...options.usageLimits };
  }

  createProject(input: ProjectCreateInput) {
    if (this.projects.has(input.id)) {
      throw new ProjectAlreadyExistsError(input.id);
    }

    this.assertWritable(input.ownerId, "projects");

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

    this.projects.set(project.id, project);
    this.recordVersion(project, input.ownerId, timestampIso);
    this.audit(project, input.ownerId, "project-created", timestampIso);
    return cloneProject(project);
  }

  getProject(projectId: string) {
    const project = this.projects.get(projectId);

    return project ? cloneProject(project) : null;
  }

  listProjects(ownerId?: string) {
    return [...this.projects.values()]
      .filter((project) => !ownerId || project.ownerId === ownerId)
      .map(cloneProject);
  }

  listProjectVersions(projectId: string) {
    return (this.versions.get(projectId) ?? []).map(cloneVersion);
  }

  updateScene(input: ProjectUpdateInput) {
    const project = this.projects.get(input.projectId);

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

    this.assertWritable(project.ownerId);

    const timestampIso = input.timestampIso ?? new Date().toISOString();
    const nextProject: ProjectRecord = {
      ...project,
      scene: parseScene(input.scene),
      updatedAtIso: timestampIso,
      version: project.version + 1,
    };

    this.projects.set(input.projectId, nextProject);
    this.recordVersion(nextProject, input.actorId, timestampIso);
    this.audit(nextProject, input.actorId, "scene-updated", timestampIso);
    this.events.push({
      actorId: input.actorId,
      atIso: timestampIso,
      kind: "scene-updated",
      projectId: input.projectId,
      version: nextProject.version,
    });

    return cloneProject(nextProject);
  }

  appendEvent(event: CollaborationEvent) {
    this.events.push(cloneJson(event));
  }

  createReadOnlyShareLink(input: ShareLinkCreateInput) {
    const project = this.projects.get(input.projectId);

    if (!project) {
      return null;
    }

    this.assertWritable(project.ownerId, "share-links");

    const timestampIso = input.timestampIso ?? new Date().toISOString();
    const shareLink: ShareLinkRecord = {
      access: "read-only",
      createdAtIso: timestampIso,
      createdBy: input.actorId,
      expiresAtIso: input.expiresAtIso,
      projectId: input.projectId,
      token: this.mintShareToken(),
    };

    this.shareLinks.set(shareLink.token, shareLink);
    this.recordUsage(project.ownerId, "share-links");
    this.audit(project, input.actorId, "share-link-created", timestampIso);

    return cloneJson(shareLink);
  }

  resolveShareLink(token: string, nowIso = new Date().toISOString()) {
    const shareLink = this.shareLinks.get(token);

    if (!shareLink || isExpired(shareLink, nowIso)) {
      return null;
    }

    const project = this.getProject(shareLink.projectId);

    return project
      ? {
          project,
          shareLink: cloneJson(shareLink),
        }
      : null;
  }

  recordUsage(ownerId: string, metric: UsageMetric, amount = 1) {
    const current = this.usage.get(ownerId) ?? {};
    const next = {
      ...current,
      [metric]: (current[metric] ?? 0) + Math.max(0, amount),
    };

    this.usage.set(ownerId, next);
    return this.getUsageSnapshot(ownerId);
  }

  getUsageSnapshot(ownerId: string): UsageSnapshot {
    const manualUsage = this.usage.get(ownerId) ?? {};
    const usage: Record<UsageMetric, number> = {
      "ai-calls": manualUsage["ai-calls"] ?? 0,
      "experiment-runs": manualUsage["experiment-runs"] ?? 0,
      projects: this.listProjects(ownerId).length,
      "share-links": [...this.shareLinks.values()].filter((shareLink) => {
        const project = this.projects.get(shareLink.projectId);

        return project?.ownerId === ownerId;
      }).length,
      "stored-replays": manualUsage["stored-replays"] ?? 0,
      "tiles-requests": manualUsage["tiles-requests"] ?? 0,
    };

    return {
      limits: { ...this.limits },
      ownerId,
      usage,
      withinQuota: (Object.keys(usage) as UsageMetric[]).every(
        (metric) => usage[metric] <= this.limits[metric],
      ),
    };
  }

  snapshot(): ProjectStoreSnapshot {
    return {
      auditLog: this.auditLog.map((entry) => ({ ...entry })),
      events: this.events.map((event) => cloneJson(event)),
      projects: this.listProjects(),
      shareLinks: [...this.shareLinks.values()].map((shareLink) =>
        cloneJson(shareLink),
      ),
      versions: [...this.versions.values()].flat().map(cloneVersion),
    };
  }

  /**
   * Counting a resource without refusing to create it means the limit is only
   * a report, so every write path funnels through this check first.
   */
  private assertWritable(ownerId: string, metric?: UsageMetric) {
    const snapshot = this.getUsageSnapshot(ownerId);
    const exceeded =
      findExceededUsageMetric(snapshot) ??
      (metric && snapshot.usage[metric] >= snapshot.limits[metric]
        ? metric
        : undefined);

    if (exceeded) {
      throw new UsageQuotaExceededError(ownerId, exceeded, snapshot.limits[exceeded]);
    }
  }

  private mintShareToken() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const token = this.createShareToken();

      if (!this.shareLinks.has(token)) {
        return token;
      }
    }

    throw new Error("Unable to mint a unique share link token");
  }

  private recordVersion(project: ProjectRecord, actorId: string, createdAtIso: string) {
    const versions = this.versions.get(project.id) ?? [];
    versions.push({
      actorId,
      createdAtIso,
      projectId: project.id,
      scene: parseScene(project.scene),
      version: project.version,
    });
    this.versions.set(project.id, versions);
  }

  private audit(
    project: ProjectRecord,
    actorId: string,
    action: string,
    atIso: string,
  ) {
    this.auditLog.push({
      action,
      actorId,
      atIso,
      projectId: project.id,
      version: project.version,
    });
  }
}

function cloneProject(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    scene: parseScene(cloneJson(project.scene)),
  };
}

function cloneVersion(version: ProjectVersionRecord): ProjectVersionRecord {
  return {
    ...version,
    scene: parseScene(cloneJson(version.scene)),
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isExpired(shareLink: ShareLinkRecord, nowIso: string) {
  return Boolean(shareLink.expiresAtIso && shareLink.expiresAtIso < nowIso);
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Declared locally because this package targets plain ES2022 (no DOM lib) yet
// runs on Workers, browsers, and Node, all of which expose globalThis.crypto.
type WebCryptoLike = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

const globalScope = globalThis as unknown as { crypto?: WebCryptoLike };
