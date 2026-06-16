import { describe, expect, it } from "vitest";
import {
  createUiProductizationAudit,
  createUiProductizationReport,
} from "./uiProductizationAudit";

describe("UI productization audit", () => {
  it("tracks final productized UI areas explicitly", () => {
    const report = createUiProductizationReport();

    expect(report.map((item) => item.id)).toEqual([
      "home",
      "command-bar",
      "sidebar",
      "stage",
      "inspector",
      "mobile-responsive",
    ]);
    expect(report.every((item) => item.status === "complete")).toBe(true);
    expect(report.every((item) => item.completionPercent === 100)).toBe(true);
    expect(report.every((item) => item.evidence.length >= 3)).toBe(true);
  });

  it("does not leave blockers for the phase 2 completion gate", () => {
    const audit = createUiProductizationAudit();

    expect(audit).toEqual({
      blocksCompletion: false,
      completeCount: 6,
      completionPercent: 100,
      itemCount: 6,
      remainingBlockers: [],
    });
  });
});
