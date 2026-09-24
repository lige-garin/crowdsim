import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { createSceneRenderPlan } from "./sceneRenderPlan";
import { sceneAtmosphere } from "./simulationViewportSceneObjects";

describe("sceneAtmosphere", () => {
  it("turns the rainy scene into a wet, fogged environment", () => {
    const atmosphere = sceneAtmosphere(
      createSceneRenderPlan(defaultDemoScene, 2_100),
      0,
    );

    expect(atmosphere.fogDensity).toBeGreaterThan(0);
    expect(atmosphere.background).not.toBe("#eaf2f7");
    expect(atmosphere.overcast).toBeGreaterThan(0);
  });

  it("keeps the sky tied to the local day and night cycle", () => {
    const plan = createSceneRenderPlan(defaultDemoScene, 2_100);

    expect(sceneAtmosphere(plan, 0).background).not.toBe(
      sceneAtmosphere(plan, 60).background,
    );
  });
});
