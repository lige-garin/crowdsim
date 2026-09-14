import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityAssetLoadPlans,
  createBioCityAssetWorldTransform,
  prepareBioCityVisualAssetObject,
  summarizeBioCityAssetLoading,
} from "./bioCityModelAssets";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";

describe("bioCityModelAssets", () => {
  it("plans GLB and GLTF assets for GLTFLoader with placeholder fallback", () => {
    const renderPlan = createBioCityRenderPlan(bioCityDemoScene, 0);
    const loadPlans = createBioCityAssetLoadPlans(renderPlan.assets);

    expect(loadPlans).toEqual([
      {
        estimatedTriangles: 120000,
        fallback: "placeholder",
        id: "asset-rain-market-streetscape",
        loader: "gltf-loader",
        requestedLod: "medium",
        selectedLod: "medium",
        sourceUrl: "/assets/biocity/rain-market-streetscape.glb",
      },
      {
        estimatedTriangles: 7500,
        fallback: "placeholder",
        id: "asset-bus-stop-shelter",
        loader: "gltf-loader",
        requestedLod: "medium",
        selectedLod: "medium",
        sourceUrl: "/assets/biocity/bus-stop-shelter.glb",
      },
    ]);
  });

  it("selects quality-specific LOD sources without exceeding asset LOD", () => {
    const renderPlan = createBioCityRenderPlan(bioCityDemoScene, 0);
    const lowPlans = createBioCityAssetLoadPlans(renderPlan.assets, {
      quality: "low",
    });
    const highPlans = createBioCityAssetLoadPlans(renderPlan.assets, {
      quality: "high",
    });

    expect(lowPlans[0]).toMatchObject({
      selectedLod: "low",
      sourceUrl: "/assets/biocity/rain-market-streetscape.low.glb",
    });
    expect(lowPlans[1]).toMatchObject({
      selectedLod: "low",
      sourceUrl: "/assets/biocity/bus-stop-shelter.low.glb",
    });
    expect(highPlans[0]).toMatchObject({
      requestedLod: "high",
      selectedLod: "medium",
      sourceUrl: "/assets/biocity/rain-market-streetscape.glb",
    });
  });

  it("keeps 3D tiles on the tileset renderer path", () => {
    const renderPlan = createBioCityRenderPlan(
      {
        ...bioCityDemoScene,
        visualAssets: [
          {
            anchor: { x: 80, y: 48, z: 0 },
            calibration: {
              origin: "scene-anchor",
              unitScaleMeters: 1,
              upAxis: "y-up",
              verified: false,
            },
            collisionMode: "none",
            id: "city-tiles",
            kind: "tileset",
            lod: "medium",
            lodSources: {},
            rotationDegrees: 0,
            scale: 1,
            sourceUrl: "/assets/biocity/tileset.json",
            visible: true,
            customParameters: {},
          },
        ],
      },
      0,
    );

    expect(createBioCityAssetLoadPlans(renderPlan.assets)[0]).toMatchObject({
      fallback: "placeholder",
      id: "asset-city-tiles",
      loader: "tileset-renderer",
    });
  });

  it("summarizes loader readiness and source URL de-duplication", () => {
    const renderPlan = createBioCityRenderPlan(
      {
        ...bioCityDemoScene,
        visualAssets: [
          ...bioCityDemoScene.visualAssets,
          {
            ...bioCityDemoScene.visualAssets[1],
            id: "bus-stop-shelter-copy",
          },
        ],
      },
      0,
    );

    expect(
      summarizeBioCityAssetLoading(createBioCityAssetLoadPlans(renderPlan.assets)),
    ).toEqual({
      assetCount: 3,
      deferredCount: 0,
      estimatedTriangles: 135000,
      fallbackCount: 3,
      gltfCount: 3,
      highLodCount: 0,
      lowLodCount: 0,
      mediumLodCount: 3,
      tilesetCount: 0,
      uniqueSourceCount: 2,
    });
  });

  it("reports deferred assets when the unique source budget is exceeded", () => {
    const renderPlan = createBioCityRenderPlan(bioCityDemoScene, 0);
    const plans = createBioCityAssetLoadPlans(renderPlan.assets, {
      maxUniqueSources: 1,
    });

    expect(summarizeBioCityAssetLoading(plans)).toMatchObject({
      deferredCount: 1,
      uniqueSourceCount: 1,
    });
    expect(plans[1]).toMatchObject({
      estimatedTriangles: 0,
      sourceUrl: "",
    });
  });

  it("applies visual asset calibration to world transforms", () => {
    const renderPlan = createBioCityRenderPlan(
      {
        ...bioCityDemoScene,
        visualAssets: [
          {
            ...bioCityDemoScene.visualAssets[0],
            calibration: {
              ...bioCityDemoScene.visualAssets[0].calibration,
              unitScaleMeters: 0.5,
              upAxis: "z-up",
            },
            scale: 2,
          },
        ],
      },
      0,
    );

    expect(
      createBioCityAssetWorldTransform(renderPlan.assets[0], bioCityDemoScene),
    ).toEqual({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
    });
  });

  it("clones cached mesh resources so a placed copy can be disposed safely", () => {
    const cached = new Group();
    const building = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const wall = new MeshStandardMaterial({ color: "#c9d4e3", roughness: 0.82 });
    const roof = new MeshStandardMaterial({ color: "#2f3a48", roughness: 0.8 });
    const window = new MeshStandardMaterial({
      color: "#dbeafe",
      emissive: "#ffd23a",
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });

    building.add(new Mesh(geometry, wall), new Mesh(geometry, roof));
    for (let index = 0; index < 10; index++) {
      building.add(new Mesh(geometry, window));
    }
    building.position.set(4, 5, 6);
    cached.add(building);

    const prepared = prepareBioCityVisualAssetObject(cached.clone(true));
    const meshes: Mesh[] = [];
    prepared.traverse((child) => child instanceof Mesh && meshes.push(child));
    const materials = meshes.map((mesh) => mesh.material as MeshStandardMaterial);

    expect(new Set(meshes.map((mesh) => mesh.geometry)).size).toBe(meshes.length);
    expect(new Set(materials).size).toBe(materials.length);
    expect(meshes[0].geometry).not.toBe(geometry);
    expect(materials[0]).not.toBe(wall);
    expect(prepared.children[0].position.toArray()).toEqual([4, 5, 6]);
  });
});
