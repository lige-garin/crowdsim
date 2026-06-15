import type {
  ProjectCreateInput,
  ProjectRecord,
  ProjectUpdateInput,
  ProjectVersionRecord,
  ShareLinkCreateInput,
  ShareLinkRecord,
  UsageMetric,
  UsageSnapshot,
} from "@crowdsim/collab";

type MaybePromise<T> = T | Promise<T>;

export type ProjectStore = {
  createProject(input: ProjectCreateInput): MaybePromise<ProjectRecord>;
  createReadOnlyShareLink(
    input: ShareLinkCreateInput,
  ): MaybePromise<ShareLinkRecord | null>;
  getProject(projectId: string): MaybePromise<ProjectRecord | null>;
  getUsageSnapshot(ownerId: string): MaybePromise<UsageSnapshot>;
  listProjectVersions(projectId: string): MaybePromise<ProjectVersionRecord[]>;
  listProjects(ownerId?: string): MaybePromise<ProjectRecord[]>;
  recordUsage(
    ownerId: string,
    metric: UsageMetric,
    amount?: number,
  ): MaybePromise<UsageSnapshot>;
  resolveShareLink(
    token: string,
    nowIso?: string,
  ): MaybePromise<{ project: ProjectRecord; shareLink: ShareLinkRecord } | null>;
  updateScene(input: ProjectUpdateInput): MaybePromise<ProjectRecord | null>;
};

export type ProjectArtifactKind = "replay" | "report";

export type ProjectArtifactRecord = {
  artifactId: string;
  bytes: number;
  contentType: string;
  createdAtIso: string;
  createdBy: string;
  key: string;
  kind: ProjectArtifactKind;
  projectId: string;
};

export type ProjectArtifactWriteInput = {
  actorId: string;
  artifactId: string;
  body: ArrayBuffer;
  contentType: string;
  kind: ProjectArtifactKind;
  projectId: string;
  timestampIso: string;
};

export type ProjectArtifactReadResult = {
  body: BodyInit | null;
  record: ProjectArtifactRecord;
};

export type ProjectArtifactStore = {
  getProjectArtifact(
    projectId: string,
    kind: ProjectArtifactKind,
    artifactId: string,
  ): Promise<ProjectArtifactReadResult | null>;
  putProjectArtifact(
    input: ProjectArtifactWriteInput,
  ): Promise<ProjectArtifactRecord | null>;
};
