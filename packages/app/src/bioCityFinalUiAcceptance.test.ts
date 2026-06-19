import { describe, expect, it } from "vitest";
import {
  createBioCityFinalUiAcceptanceAudit,
  createBioCityFinalUiAcceptanceReport,
} from "./bioCityFinalUiAcceptance";

describe("bioCityFinalUiAcceptance", () => {
  it("tracks the Phase 3.10 final studio UI gate explicitly", () => {
    const report = createBioCityFinalUiAcceptanceReport();

    expect(report.map((item) => item.id)).toEqual([
      "final-studio-shell",
      "operating-status-bar",
      "game-planning-toolbox",
      "timeline-layer-controls",
      "analysis-evidence-stack",
      "responsive-density",
    ]);
    expect(report.every((item) => item.status === "complete")).toBe(true);
    expect(report.every((item) => item.completionPercent === 100)).toBe(true);
    expect(report.every((item) => item.evidence.length >= 3)).toBe(true);
  });

  it("does not leave blockers for the Phase 3.10 acceptance gate", () => {
    const audit = createBioCityFinalUiAcceptanceAudit(
      createBioCityFinalUiAcceptanceReport(),
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
