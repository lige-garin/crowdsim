import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityReportBundle,
  createBioCityWorkspacePackage,
  createBioCityWorkspaceTemplates,
  parseBioCityWorkspacePackage,
  restoreBioCityWorkspaceReplay,
  serializeBioCityWorkspacePackage,
} from "./bioCityWorkspacePackage";
import type { HeatmapCell } from "./heatmap";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
} from "./trajectoryRecording";
import type { SimulationSnapshot } from "./simulationEngine";

describe("bioCityWorkspacePackage", () => {
  it("exposes BioCity and industry templates for save/load workflows", () => {
    const templates = createBioCityWorkspaceTemplates();

    expect(templates[0]).toMatchObject({
      id: "biocity-rainy-high-street",
      name: "BioCity Rainy High Street",
      source: "biocity",
    });
    expect(templates.map((template) => template.id)).toContain("mall-atrium");
    expect(templates.every((template) => template.scene.schemaVersion)).toBe(true);
  });

  it("creates a round-trippable workspace package with scene, analytics, replay, and report", () => {
    const recording = [snapshot(0, 1), snapshot(1, 1)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({
        id: "biocity-recording",
        sceneId: bioCityDemoScene.id,
        seed: bioCityDemoScene.seed,
        startedAtIso: "2026-06-19T00:00:00.000Z",
      }),
    );
    const workspacePackage = createBioCityWorkspacePackage({
      createdAtIso: "2026-06-19T00:00:00.000Z",
      elapsedSeconds: 1200,
      heatmapCells,
      id: "workspace-biocity",
      language: "en",
      recording,
      scene: bioCityDemoScene,
    });
    const restored = parseBioCityWorkspacePackage(
      serializeBioCityWorkspacePackage(workspacePackage),
    );
    const restoredReplay = restoreBioCityWorkspaceReplay(restored);

    expect(restored).toMatchObject({
      id: "workspace-biocity",
      version: 1,
      scene: {
        id: "biocity-rainy-high-street",
      },
      analytics: {
        activeRiskCount: 1,
      },
      report: {
        filename: "crowdsim-v2-calibration-en-2026-06-19.html",
        mimeType: "text/html",
        pdfReady: true,
      },
    });
    expect(restored.templateIds).toContain("biocity-rainy-high-street");
    expect(restored.report.html).toContain("Commercial behavior validation");
    expect(restoredReplay.frames).toEqual(recording.frames);
  });

  it("creates a BioCity printable report bundle with digest metadata", () => {
    const bundle = createBioCityReportBundle({
      generatedAtIso: "2026-06-19T00:00:00.000Z",
      language: "en",
      scene: bioCityDemoScene,
    });

    expect(bundle.filename).toBe("crowdsim-v2-calibration-en-2026-06-19.html");
    expect(bundle.contentDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.html).toContain("Commercial behavior validation");
    expect(bundle.pdfReady).toBe(true);
  });
});

const heatmapCells: HeatmapCell[] = [
  {
    count: 32,
    densityPerSquareMeter: 2.0,
    level: "E",
    height: 4,
    id: "workspace-peak",
    intensity: 1,
    width: 4,
    x: 92,
    y: 56,
  },
];

function snapshot(elapsedSeconds: number, agentId: number): SimulationSnapshot {
  return {
    agentCount: 1,
    agents: [
      {
        id: agentId,
        targetX: 16,
        targetY: 8,
        vx: 1,
        vy: 0,
        x: elapsedSeconds * 2,
        y: elapsedSeconds,
      },
    ],
    elapsedSeconds,
    exitedCount: 0,
    spawnedCount: agentId,
    status: "running",
    stepCount: elapsedSeconds * 10,
    timeScale: 1,
  };
}
