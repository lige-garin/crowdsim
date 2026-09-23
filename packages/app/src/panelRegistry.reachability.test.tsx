import { describe, expect, it } from "vitest";
import { panelRegistry } from "./panelRegistry";

// The SP-5a batch registered 13 previously-orphaned panels. Five of those
// were deleted 2026-09-24: ai-workflow, image-geometry, tiles-backdrop as
// disclosed-fake fixtures, and project-workspace, collaboration-status
// alongside the entire optional backend/collab package they fronted
// (undeployable as shipped, unreachable from the client -- see
// docs/CLAIMS_LEDGER.md). The remaining 8 are still expected to be
// reachable exactly once.
const EXPECTED = [
  "scenario-comparison",
  "experiment-sweep",
  "experiment-summary",
  "validation-report",
  "brand-intelligence",
  "scale-readiness",
  "template-library",
  "trajectory-replay",
];

describe("panel reachability", () => {
  it("registers every panel exactly once", () => {
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
