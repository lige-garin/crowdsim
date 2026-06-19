import type { BioCityWorkspacePackage } from "./bioCityWorkspacePackage";
import {
  createBioCityWorkspaceTemplates,
  parseBioCityWorkspacePackage,
  restoreBioCityWorkspaceReplay,
  serializeBioCityWorkspacePackage,
} from "./bioCityWorkspacePackage";

export type BioCityWorkspaceAcceptanceItem = {
  blocksCompletion: boolean;
  completionPercent: number;
  evidence: string[];
  id: "reports" | "replay" | "save-load" | "templates";
  status: "complete" | "partial";
};

export type BioCityWorkspaceAcceptanceAudit = {
  blocksCompletion: boolean;
  completeCount: number;
  completionPercent: number;
  itemCount: number;
  remainingBlockers: string[];
};

export function createBioCityWorkspaceAcceptanceReport(
  workspacePackage: BioCityWorkspacePackage,
): BioCityWorkspaceAcceptanceItem[] {
  const serialized = serializeBioCityWorkspacePackage(workspacePackage);
  const restored = parseBioCityWorkspacePackage(serialized);
  const templates = createBioCityWorkspaceTemplates();
  const replay = restoreBioCityWorkspaceReplay(restored);

  return [
    createItem({
      complete:
        restored.version === 1 &&
        restored.scene.id === workspacePackage.scene.id &&
        restored.analytics.activeRiskCount ===
          workspacePackage.analytics.activeRiskCount,
      evidence: [
        `bytes=${serialized.length}`,
        `sceneId=${restored.scene.id}`,
        `analyticsRisk=${restored.analytics.activeRiskCount}`,
      ],
      id: "save-load",
    }),
    createItem({
      complete:
        templates.some((template) => template.source === "biocity") &&
        restored.templateIds.includes("biocity-rainy-high-street") &&
        templates.length >= 6,
      evidence: [
        `templates=${templates.length}`,
        `biocity=${templates.filter((template) => template.source === "biocity").length}`,
        `packageRefs=${restored.templateIds.length}`,
      ],
      id: "templates",
    }),
    createItem({
      complete:
        restored.packedReplay.version === 1 &&
        replay.frames.length === restored.packedReplay.frames.length,
      evidence: [
        `packedFrames=${restored.packedReplay.frames.length}`,
        `restoredFrames=${replay.frames.length}`,
        `runtime=${restored.packedReplay.runtime.thread}/${restored.packedReplay.runtime.sharedMemory}`,
      ],
      id: "replay",
    }),
    createItem({
      complete:
        restored.report.pdfReady &&
        restored.report.mimeType === "text/html" &&
        restored.report.contentDigest.length === 16,
      evidence: [
        `filename=${restored.report.filename}`,
        `mime=${restored.report.mimeType}`,
        `digest=${restored.report.contentDigest}`,
      ],
      id: "reports",
    }),
  ];
}

export function createBioCityWorkspaceAcceptanceAudit(
  report: readonly BioCityWorkspaceAcceptanceItem[],
): BioCityWorkspaceAcceptanceAudit {
  const completeCount = report.filter((item) => item.status === "complete").length;
  const remainingBlockers = report
    .filter((item) => item.blocksCompletion || item.status !== "complete")
    .map((item) => item.id);

  return {
    blocksCompletion: remainingBlockers.length > 0,
    completeCount,
    completionPercent:
      report.length > 0
        ? Math.round(
            report.reduce((sum, item) => sum + item.completionPercent, 0) /
              report.length,
          )
        : 0,
    itemCount: report.length,
    remainingBlockers,
  };
}

function createItem({
  complete,
  evidence,
  id,
}: {
  complete: boolean;
  evidence: string[];
  id: BioCityWorkspaceAcceptanceItem["id"];
}): BioCityWorkspaceAcceptanceItem {
  return {
    blocksCompletion: !complete,
    completionPercent: complete ? 100 : 60,
    evidence,
    id,
    status: complete ? "complete" : "partial",
  };
}
