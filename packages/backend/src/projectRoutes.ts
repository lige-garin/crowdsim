import type { ProjectRecord, ShareLinkRecord, UsageMetric } from "@crowdsim/collab";
import { parseScene } from "@crowdsim/scene-schema";
import type { AuthSessionRecord } from "./auth";
import {
  jsonResponse,
  quotaResponse,
  readField,
  readJson,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readUsageMetric,
} from "./backendRequestUtils";
import { handleProjectArtifactRequest } from "./projectArtifacts";
import type { ProjectArtifactStore, ProjectStore } from "./storage";

export type ProjectRouteOptions = {
  artifacts?: ProjectArtifactStore;
  nowIso: () => string;
};

export async function routeProjectRequest(
  request: Request,
  store: ProjectStore,
  session: AuthSessionRecord,
  options: ProjectRouteOptions,
  route: { method: string; projectId: string; segments: string[] },
) {
  const { method, projectId, segments } = route;
  const nowIso = options.nowIso;
  const actorId = session.account.id;
  const project = await store.getProject(projectId);

  // 404 rather than 403 on someone else's project: a 403 would confirm that
  // the id exists.
  if (!project || project.ownerId !== actorId) {
    return jsonResponse({ error: "project-not-found" }, 404);
  }

  if (method === "GET" && segments.length === 3) {
    return jsonResponse({ project });
  }

  if (method === "PUT" && segments[3] === "scene" && segments.length === 4) {
    const body = await readJson(request);
    const updated = await store.updateScene({
      actorId,
      expectedVersion: readNumber(body, "expectedVersion"),
      projectId,
      scene: parseScene(readField(body, "scene")),
      timestampIso: nowIso(),
    });

    return updated
      ? jsonResponse({ project: updated })
      : jsonResponse({ error: "project-not-found" }, 404);
  }

  if (method === "GET" && segments[3] === "versions" && segments.length === 4) {
    return jsonResponse({ versions: await store.listProjectVersions(projectId) });
  }

  if (method === "POST" && segments[3] === "share-links" && segments.length === 4) {
    const body = await readJson(request);
    const shareLink = await store.createReadOnlyShareLink({
      actorId,
      expiresAtIso: readOptionalString(body, "expiresAtIso"),
      projectId,
      timestampIso: nowIso(),
    });

    return shareLink
      ? jsonResponse({ shareLink }, 201)
      : jsonResponse({ error: "project-not-found" }, 404);
  }

  if (segments[3] === "artifacts" && segments.length === 6) {
    return handleProjectArtifactRequest({
      actorId,
      artifacts: options.artifacts,
      nowIso,
      projectId,
      request,
      segments,
    });
  }

  return jsonResponse({ error: "not-found" }, 404);
}

export async function routeUsageRequest(
  request: Request,
  store: ProjectStore,
  ownerId: string,
  route: { method: string; segments: string[] },
) {
  const { method, segments } = route;

  if (segments[2] !== ownerId) {
    return jsonResponse({ error: "usage-not-found" }, 404);
  }

  if (method === "GET" && segments.length === 3) {
    return jsonResponse({ usage: await store.getUsageSnapshot(ownerId) });
  }

  if (method === "POST" && segments.length === 3) {
    const body = await readJson(request);
    const metric = readUsageMetric(body);
    const amount = readOptionalNumber(body, "amount") ?? 1;
    const quota = await checkQuota(store, ownerId, metric, amount);

    if (quota) {
      return quota;
    }

    return jsonResponse({ usage: await store.recordUsage(ownerId, metric, amount) });
  }

  return jsonResponse({ error: "not-found" }, 404);
}

export async function checkQuota(
  store: ProjectStore,
  ownerId: string,
  metric: UsageMetric,
  amount = 1,
) {
  const snapshot = await store.getUsageSnapshot(ownerId);

  if (
    !snapshot.withinQuota ||
    snapshot.usage[metric] + amount > snapshot.limits[metric]
  ) {
    return quotaResponse(metric, snapshot.limits[metric]);
  }

  return null;
}

/**
 * A share link is an anonymous URL, so the payload carries the scene and
 * nothing that identifies the owner.
 */
export function toSharedReadOnlyPayload(resolved: {
  project: ProjectRecord;
  shareLink: ShareLinkRecord;
}) {
  return {
    project: {
      id: resolved.project.id,
      name: resolved.project.name,
      scene: resolved.project.scene,
      updatedAtIso: resolved.project.updatedAtIso,
      version: resolved.project.version,
    },
    shareLink: {
      access: resolved.shareLink.access,
      expiresAtIso: resolved.shareLink.expiresAtIso,
      projectId: resolved.shareLink.projectId,
      token: resolved.shareLink.token,
    },
  };
}
