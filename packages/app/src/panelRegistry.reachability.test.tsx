import { describe, expect, it } from "vitest";
import { panelRegistry } from "./panelRegistry";

const EXPECTED = [
  "scenario-comparison",
  "experiment-sweep",
  "experiment-summary",
  "validation-report",
  "brand-intelligence",
  "neural-correction",
  "scale-readiness",
  "project-workspace",
  "collaboration-status",
  "template-library",
  "ai-workflow",
  "image-geometry",
  "tiles-backdrop",
  "trajectory-replay",
];

describe("panel reachability", () => {
  it("registers all 14 previously-orphaned panels exactly once", () => {
    const ids = panelRegistry.map((panel) => panel.id);
    for (const id of EXPECTED) {
      expect(ids.filter((value) => value === id).length, id).toBe(1);
    }
    expect(ids.length).toBeGreaterThanOrEqual(EXPECTED.length);
  });

  it("gives every registered panel a stable id and both labels", () => {
    for (const panel of panelRegistry) {
      expect(panel.id.length).toBeGreaterThan(0);
      expect(panel.labelZh.length).toBeGreaterThan(0);
      expect(panel.labelEn.length).toBeGreaterThan(0);
      expect(typeof panel.render).toBe("function");
    }
  });
});
