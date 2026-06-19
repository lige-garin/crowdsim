import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createBioCityAnalyticsSummary } from "./bioCityAnalytics";
import type { HeatmapCell } from "./heatmap";
import { industryTemplates } from "./industryTemplates";
import {
  createValidationReportExportBundle,
  type ValidationReportExportBundle,
} from "./reportExport";
import {
  createValidationReport,
  type ValidationReportLanguage,
} from "./validationReport";
import {
  packTrajectoryRecording,
  unpackTrajectoryRecording,
  type PackedTrajectoryRecording,
  type TrajectoryRecording,
} from "./trajectoryRecording";

export type BioCityWorkspaceTemplate = {
  description: string;
  id: string;
  name: string;
  scene: CrowdSimScene;
  source: "biocity" | "industry";
};

export type BioCityWorkspacePackage = {
  analytics: ReturnType<typeof createBioCityAnalyticsSummary>;
  createdAtIso: string;
  id: string;
  packedReplay: PackedTrajectoryRecording;
  report: Pick<
    ValidationReportExportBundle,
    "contentDigest" | "filename" | "html" | "mimeType" | "pdfReady"
  >;
  scene: CrowdSimScene;
  templateIds: string[];
  version: 1;
};

export function createBioCityWorkspaceTemplates(): BioCityWorkspaceTemplate[] {
  return [
    {
      description:
        "Rainy commercial street with bus stop queueing, retail conversion, hazards, weather, and imported 3D visual assets.",
      id: "biocity-rainy-high-street",
      name: bioCityDemoScene.name,
      scene: bioCityDemoScene,
      source: "biocity",
    },
    ...industryTemplates.map((template) => ({
      description: template.description.en,
      id: template.id,
      name: template.scene.name,
      scene: template.scene,
      source: "industry" as const,
    })),
  ];
}

export function createBioCityWorkspacePackage(options: {
  createdAtIso?: string;
  elapsedSeconds: number;
  heatmapCells: readonly HeatmapCell[];
  id?: string;
  language?: ValidationReportLanguage;
  recording: TrajectoryRecording;
  scene: CrowdSimScene;
}): BioCityWorkspacePackage {
  const createdAtIso = options.createdAtIso ?? new Date().toISOString();
  const reportBundle = createBioCityReportBundle({
    generatedAtIso: createdAtIso,
    language: options.language ?? "en",
    scene: options.scene,
  });

  return {
    analytics: createBioCityAnalyticsSummary({
      elapsedSeconds: options.elapsedSeconds,
      heatmapCells: options.heatmapCells,
      scene: options.scene,
    }),
    createdAtIso,
    id: options.id ?? `${options.scene.id}-workspace`,
    packedReplay: packTrajectoryRecording(options.recording),
    report: {
      contentDigest: reportBundle.contentDigest,
      filename: reportBundle.filename,
      html: reportBundle.html,
      mimeType: reportBundle.mimeType,
      pdfReady: reportBundle.pdfReady,
    },
    scene: options.scene,
    templateIds: createBioCityWorkspaceTemplates().map((template) => template.id),
    version: 1,
  };
}

export function serializeBioCityWorkspacePackage(
  workspacePackage: BioCityWorkspacePackage,
) {
  return JSON.stringify(workspacePackage, null, 2);
}

export function parseBioCityWorkspacePackage(
  serialized: string,
): BioCityWorkspacePackage {
  const parsed = JSON.parse(serialized) as BioCityWorkspacePackage;
  const scene = parseScene(parsed.scene);

  return {
    ...parsed,
    scene,
  };
}

export function restoreBioCityWorkspaceReplay(
  workspacePackage: BioCityWorkspacePackage,
) {
  return unpackTrajectoryRecording(workspacePackage.packedReplay);
}

export function createBioCityReportBundle(options: {
  generatedAtIso: string;
  language: ValidationReportLanguage;
  scene: CrowdSimScene;
}) {
  return createValidationReportExportBundle(
    createValidationReport({
      commercialScene: options.scene,
      generatedAtIso: options.generatedAtIso,
    }),
    options.language,
  );
}
