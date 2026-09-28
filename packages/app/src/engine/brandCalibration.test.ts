import { describe, expect, it } from "vitest";
import { calibrateBrandAttraction } from "./brandCalibration";
import { createBrandStoresFromScene } from "./brandAttraction";
import { demoScene } from "../scenes/demoScene";

describe("brand calibration", () => {
  it("raises brand power for under-predicted stores", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const before = stores.find((store) => store.id === "mono-thread")!;
    const result = calibrateBrandAttraction(stores, [
      {
        observedEntryRate: 0.62,
        predictedEntryRate: 0.38,
        storeId: "mono-thread",
      },
    ]);
    const after = result.adjustedStores.find((store) => store.id === "mono-thread")!;

    expect(after.brand.brandPower).toBeGreaterThan(before.brand.brandPower);
    expect(result.errors[0]?.residualAfter).toBeLessThan(
      result.errors[0]?.residualBefore ?? 1,
    );
  });

  it("reduces mean absolute calibration error", () => {
    const stores = createBrandStoresFromScene(demoScene);
    const result = calibrateBrandAttraction(stores, [
      {
        observedEntryRate: 0.52,
        predictedEntryRate: 0.34,
        storeId: "coffee-pulse",
      },
      {
        observedEntryRate: 0.2,
        predictedEntryRate: 0.38,
        storeId: "atelier-nine",
      },
    ]);

    expect(result.meanAbsoluteErrorAfter).toBeLessThan(result.meanAbsoluteErrorBefore);
  });
});
