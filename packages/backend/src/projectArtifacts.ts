import { jsonResponse, readArtifactKind } from "./backendRequestUtils";
import type { ProjectArtifactStore } from "./storage";

export type ProjectArtifactRequestInput = {
  actorId: string;
  artifacts?: ProjectArtifactStore;
  nowIso: () => string;
  projectId: string;
  request: Request;
  segments: readonly string[];
};

export async function handleProjectArtifactRequest(input: ProjectArtifactRequestInput) {
  const { artifacts, projectId, request, segments } = input;

  if (!artifacts) {
    return jsonResponse(
      {
        error: "project-artifact-store-missing",
        message: "Replay and report artifacts require an R2-backed store.",
      },
      503,
    );
  }

  const kind = readArtifactKind(segments[4]);
  const artifactId = segments[5];
  const method = request.method.toUpperCase();

  if (method === "POST") {
    const record = await artifacts.putProjectArtifact({
      // Taken from the session: the previous x-crowdsim-actor header let any
      // caller stamp an upload with someone else's name.
      actorId: input.actorId,
      artifactId,
      body: await request.arrayBuffer(),
      contentType: request.headers.get("content-type") ?? "application/octet-stream",
      kind,
      projectId,
      timestampIso: input.nowIso(),
    });

    return record
      ? jsonResponse({ artifact: record }, 201)
      : jsonResponse({ error: "project-not-found" }, 404);
  }

  if (method === "GET") {
    const artifact = await artifacts.getProjectArtifact(projectId, kind, artifactId);

    return artifact
      ? new Response(artifact.body, {
          headers: {
            "content-type": artifact.record.contentType,
            "x-crowdsim-artifact-key": artifact.record.key,
          },
        })
      : jsonResponse({ error: "project-artifact-not-found" }, 404);
  }

  return jsonResponse({ error: "not-found" }, 404);
}
