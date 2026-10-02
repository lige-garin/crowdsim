import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { parseScene } from "@crowdsim/scene-schema";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import {
  createSceneAssetLoadPlans,
  createSceneAssetWorldTransform,
  prepareSceneVisualAssetObject,
  summarizeSceneAssetLoading,
} from "./sceneModelAssets";
import { createSceneRenderPlan } from "../viewport/sceneRenderPlan";

// The default demo scene is fully procedural (its third-party streetscape
// GLB was removed at open-sourcing — see docs/CLAIMS_LEDGER.md, 2026-10-02
// note), so these loader-planning tests run against an inline visual-asset
// fixture instead.
const sceneWithAssets = parseScene({
  ...defaultDemoScene,
  visualAssets: [
    {
      id: "test-streetscape",
      name: "Test Streetscape",
      kind: "gltf-scene",
      sourceUrl: "/assets/test-scene/streetscape.glb",
      lodSources: {
        high: "/assets/test-scene/streetscape.high.glb",
        low: "/assets/test-scene/streetscape.low.glb",
        medium: "/assets/test-scene/streetscape.glb",
      },
      originalSourceFormat: "sketchup",
      anchor: { x: 80, y: 48, z: 0 },
      calibration: {
        accuracyMeters: 0.5,
        simulationProxy: {
          entityId: "downtown-walkable",
          kind: "area",
        },
        unitScaleMeters: 1,
        upAxis: "y-up",
        verified: true,
      },
      rotationDegrees: 0,
      scale: 1,
    },
    {
      id: "test-shelter",
      name: "Test Shelter",
      kind: "gltf-prop",
      sourceUrl: "/assets/test-scene/shelter.glb",
      lodSources: {
        low: "/assets/test-scene/shelter.low.glb",
      },
      originalSourceFormat: "glb",
      anchor: { x: 122, y: 72, z: 0 },
      calibration: {
        accuracyMeters: 0.2,
        simulationProxy: {
          entityId: "rain-market-bus-stop",
          kind: "transitStop",
        },
        unitScaleMeters: 1,
        upAxis: "y-up",
        verified: true,
      },
      scale: 0.9,
    },
  ],
});

describe("sceneModelAssets", () => {
  it("plans GLB and GLTF assets for GLTFLoader with placeholder fallback", () => {
    const renderPlan = createSceneRenderPlan(sceneWithAssets, 0);
    const loadPlans = createSceneAssetLoadPlans(renderPlan.assets);

    expect(loadPlans).toEqual([
      {
        estimatedTriangles: 120000,
        fallback: "placeholder",
        id: "asset-test-streetscape",
        loader: "gltf-loader",
        requestedLod: "medium",
        selectedLod: "medium",
        sourceUrl: "/assets/test-scene/streetscape.glb",
      },
      {
        estimatedTriangles: 7500,
        fallback: "placeholder",
        id: "asset-test-shelter",
        loader: "gltf-loader",
        requestedLod: "medium",
        selectedLod: "medium",
        sourceUrl: "/assets/test-scene/shelter.glb",
      },
    ]);
  });

  it("selects quality-specific LOD sources without exceeding asset LOD", () => {
    const renderPlan = createSceneRenderPlan(sceneWithAssets, 0);
    const lowPlans = createSceneAssetLoadPlans(renderPlan.assets, {
      quality: "low",
    });
    const highPlans = createSceneAssetLoadPlans(renderPlan.assets, {
      quality: "high",
    });

    expect(lowPlans[0]).toMatchObject({
      selectedLod: "low",
      sourceUrl: "/assets/test-scene/streetscape.low.glb",
    });
    expect(lowPlans[1]).toMatchObject({
      selectedLod: "low",
      sourceUrl: "/assets/test-scene/shelter.low.glb",
    });
    expect(highPlans[0]).toMatchObject({
      requestedLod: "high",
      selectedLod: "medium",
      sourceUrl: "/assets/test-scene/streetscape.glb",
    });
  });

  it("keeps 3D tiles on the tileset renderer path", () => {
    const renderPlan = createSceneRenderPlan(
      parseScene({
        ...sceneWithAssets,
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
            sourceUrl: "/assets/test-scene/tileset.json",
            visible: true,
            customParameters: {},
          },
        ],
      }),
      0,
    );

    expect(createSceneAssetLoadPlans(renderPlan.assets)[0]).toMatchObject({
      fallback: "placeholder",
      id: "asset-city-tiles",
      loader: "tileset-renderer",
    });
  });

  it("summarizes loader readiness and source URL de-duplication", () => {
    const renderPlan = createSceneRenderPlan(
      parseScene({
        ...sceneWithAssets,
        visualAssets: [
          ...sceneWithAssets.visualAssets,
          {
            ...sceneWithAssets.visualAssets[1],
            id: "test-shelter-copy",
          },
        ],
      }),
      0,
    );

    expect(
      summarizeSceneAssetLoading(createSceneAssetLoadPlans(renderPlan.assets)),
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
    const renderPlan = createSceneRenderPlan(sceneWithAssets, 0);
    const plans = createSceneAssetLoadPlans(renderPlan.assets, {
      maxUniqueSources: 1,
    });

    expect(summarizeSceneAssetLoading(plans)).toMatchObject({
      deferredCount: 1,
      uniqueSourceCount: 1,
    });
    expect(plans[1]).toMatchObject({
      estimatedTriangles: 0,
      sourceUrl: "",
    });
  });

  it("applies visual asset calibration to world transforms", () => {
    const renderPlan = createSceneRenderPlan(
      parseScene({
        ...sceneWithAssets,
        visualAssets: [
          {
            ...sceneWithAssets.visualAssets[0],
            calibration: {
              ...sceneWithAssets.visualAssets[0].calibration,
              unitScaleMeters: 0.5,
              upAxis: "z-up",
            },
            scale: 2,
          },
        ],
      }),
      0,
    );

    expect(
      createSceneAssetWorldTransform(renderPlan.assets[0], sceneWithAssets),
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

    const prepared = prepareSceneVisualAssetObject(cached.clone(true));
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
