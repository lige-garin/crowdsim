import { describe, expect, it } from "vitest";
import { createBrandDecisionInsight } from "./brandDecisionProbe";
import { demoScene } from "./demoScene";

describe("brand decision probe", () => {
  it("summarizes persona, chosen brand, top stores and twin calibration", () => {
    const insight = createBrandDecisionInsight(demoScene);

    expect(insight).toBeDefined();
    expect(insight?.selectedStoreId).toBeTruthy();
    expect(insight?.probabilityPercent).toBeGreaterThan(0);
    expect(insight?.topStores.length).toBeGreaterThan(1);
    expect(insight?.reasons.length).toBeGreaterThan(0);
    expect(insight?.twin.observations).toBe(2);
    expect(insight?.calibration.meanAbsoluteErrorAfter).toBeLessThanOrEqual(
      insight?.calibration.meanAbsoluteErrorBefore ?? 1,
    );
  });
});
