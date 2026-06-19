import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityVisualAcceptanceAudit,
  createBioCityVisualAcceptanceReport,
} from "./bioCityVisualAcceptance";

describe("bioCityVisualAcceptance", () => {
  it("tracks the Phase 3.7 visual foundation gate explicitly", () => {
    const report = createBioCityVisualAcceptanceReport(bioCityDemoScene);

    expect(report.map((item) => item.id)).toEqual([
      "model-imports",
      "visual-lod",
      "render-primitives",
      "weather-effects",
      "simulation-overlays",
      "agent-annotations",
    ]);
    expect(report.every((item) => item.status === "complete")).toBe(true);
    expect(report.every((item) => item.completionPercent === 100)).toBe(true);
    expect(report.every((item) => item.evidence.length >= 3)).toBe(true);
  });

  it("does not leave blockers for the Phase 3.7 acceptance gate", () => {
    const audit = createBioCityVisualAcceptanceAudit(
      createBioCityVisualAcceptanceReport(bioCityDemoScene),
    );

    expect(audit).toEqual({
      blocksCompletion: false,
      completeCount: 6,
      completionPercent: 100,
      itemCount: 6,
      remainingBlockers: [],
    });
  });
});
