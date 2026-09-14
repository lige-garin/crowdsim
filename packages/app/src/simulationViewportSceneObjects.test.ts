import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";
import { bioCityAtmosphere } from "./simulationViewportSceneObjects";

describe("bioCityAtmosphere", () => {
  it("turns the rainy scene into a wet, fogged environment", () => {
    const atmosphere = bioCityAtmosphere(
      createBioCityRenderPlan(bioCityDemoScene, 2_100),
      0,
    );

    expect(atmosphere.fogDensity).toBeGreaterThan(0);
    expect(atmosphere.background).not.toBe("#eaf2f7");
    expect(atmosphere.overcast).toBeGreaterThan(0);
  });

  it("keeps the sky tied to the local day and night cycle", () => {
    const plan = createBioCityRenderPlan(bioCityDemoScene, 2_100);

    expect(bioCityAtmosphere(plan, 0).background).not.toBe(
      bioCityAtmosphere(plan, 60).background,
    );
  });
});
