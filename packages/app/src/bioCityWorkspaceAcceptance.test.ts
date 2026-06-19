import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityWorkspaceAcceptanceAudit,
  createBioCityWorkspaceAcceptanceReport,
} from "./bioCityWorkspaceAcceptance";
import { createBioCityWorkspacePackage } from "./bioCityWorkspacePackage";
import type { HeatmapCell } from "./heatmap";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
} from "./trajectoryRecording";
import type { SimulationSnapshot } from "./simulationEngine";

describe("bioCityWorkspaceAcceptance", () => {
  it("tracks the Phase 3.9 save/load/template/replay/report gate explicitly", () => {
    const report = createBioCityWorkspaceAcceptanceReport(createPackage());

    expect(report.map((item) => item.id)).toEqual([
      "save-load",
      "templates",
      "replay",
      "reports",
    ]);
    expect(report.every((item) => item.status === "complete")).toBe(true);
    expect(report.every((item) => item.completionPercent === 100)).toBe(true);
    expect(report.every((item) => item.evidence.length >= 3)).toBe(true);
  });

  it("does not leave blockers for the Phase 3.9 acceptance gate", () => {
    const audit = createBioCityWorkspaceAcceptanceAudit(
      createBioCityWorkspaceAcceptanceReport(createPackage()),
    );

    expect(audit).toEqual({
      blocksCompletion: false,
      completeCount: 4,
      completionPercent: 100,
      itemCount: 4,
      remainingBlockers: [],
    });
  });
});

function createPackage() {
  const recording = [snapshot(0), snapshot(1)].reduce(
    (current, item) => appendTrajectoryFrame(current, item),
    createTrajectoryRecording({
      id: "workspace-acceptance-recording",
      sceneId: bioCityDemoScene.id,
      seed: bioCityDemoScene.seed,
      startedAtIso: "2026-06-19T00:00:00.000Z",
    }),
  );

  return createBioCityWorkspacePackage({
    createdAtIso: "2026-06-19T00:00:00.000Z",
    elapsedSeconds: 1200,
    heatmapCells,
    language: "en",
    recording,
    scene: bioCityDemoScene,
  });
}

const heatmapCells: HeatmapCell[] = [
  {
    count: 20,
    height: 4,
    id: "workspace-acceptance-peak",
    intensity: 1,
    width: 4,
    x: 92,
    y: 56,
  },
];

function snapshot(elapsedSeconds: number): SimulationSnapshot {
  return {
    agentCount: 1,
    agents: [
      {
        id: 1,
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
    spawnedCount: 1,
    status: "running",
    stepCount: elapsedSeconds * 10,
    timeScale: 1,
  };
}
