import { describe, expect, it } from "vitest";
import { panelRegistry } from "./panelRegistry";

// The SP-5a batch registered 13 previously-orphaned panels. Seven of those
// were deleted 2026-09-24: ai-workflow, image-geometry, tiles-backdrop as
// disclosed-fake fixtures; project-workspace, collaboration-status
// alongside the entire optional backend/collab package they fronted
// (undeployable as shipped, unreachable from the client); scenario-comparison
// as a narrower, superseded predecessor of scenario-diff-report (ADR-0019);
// and scale-readiness as a fixture of projected, unmeasured constants (see
// docs/CLAIMS_LEDGER.md). experiment-summary was folded into experiment-sweep on 2026-09-29 (a
// synchronous, interval-free subset of it). The remaining 5 are still expected to be reachable
// exactly once.
const EXPECTED = [
  "experiment-sweep",
  "validation-report",
  "brand-intelligence",
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
