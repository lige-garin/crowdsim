import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from "three";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { createSceneRenderPlan } from "../viewport/sceneRenderPlan";
import { disposeRenderObject, sceneAtmosphere } from "./simulationViewportSceneObjects";

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

describe("disposeRenderObject", () => {
  it("frees the textures a material maps, not only the material itself", () => {
    // The ground tiles are cloned per city and shop fronts paint their own
    // canvas, so a material's maps are GPU allocations the material's own
    // dispose leaves behind — one set per viewport rebuild.
    const freed: string[] = [];
    const texture = new Texture();
    texture.addEventListener("dispose", () => freed.push("texture"));
    const material = new MeshBasicMaterial({ map: texture });
    material.addEventListener("dispose", () => freed.push("material"));
    const geometry = new PlaneGeometry(1, 1);
    geometry.addEventListener("dispose", () => freed.push("geometry"));

    disposeRenderObject(new Mesh(geometry, material));

    expect(freed.sort()).toEqual(["geometry", "material", "texture"]);
  });
});
