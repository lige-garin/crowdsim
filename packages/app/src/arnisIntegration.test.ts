import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createArnisCliCommand,
  createArnisIntegrationPlan,
  createArnisMapSourceConfig,
  estimateBoundingBoxAreaKm2,
} from "./arnisIntegration";

const downtownShanghaiBbox = {
  east: 121.476,
  north: 31.232,
  south: 31.228,
  west: 121.47,
};

describe("arnis integration", () => {
  it("creates an external Arnis map source config with attribution and area guardrails", () => {
    const config = createArnisMapSourceConfig({
      bbox: downtownShanghaiBbox,
      outputDirectory: "E:/crowdsim-data/arnis/rainy-high-street",
    });

    expect(config).toMatchObject({
      attribution: "OpenStreetMap contributors; Arnis Apache-2.0",
      license: "Apache-2.0",
      mode: "external-generator",
      projectUrl: "https://github.com/louis-e/arnis",
      provider: "arnis",
    });
    expect(estimateBoundingBoxAreaKm2(config.bbox)).toBeLessThan(1);
  });

  it("builds a CLI command and visual-only scene asset plan", () => {
    const plan = createArnisIntegrationPlan({
      bbox: downtownShanghaiBbox,
      outputDirectory: "E:/crowdsim-data/arnis/rainy-high-street",
      scene: bioCityDemoScene,
    });

    expect(plan.command).toEqual(
      createArnisCliCommand({
        attribution: "OpenStreetMap contributors; Arnis Apache-2.0",
        bbox: downtownShanghaiBbox,
        license: "Apache-2.0",
        maxRecommendedAreaKm2: 25,
        mode: "external-generator",
        outputDirectory: "E:/crowdsim-data/arnis/rainy-high-street",
        projectUrl: "https://github.com/louis-e/arnis",
        provider: "arnis",
        purpose: "real-world-osm-to-visual-basemap",
      }),
    );
    expect(plan.sceneAsset).toMatchObject({
      collisionMode: "none",
      id: "arnis-generated-context",
      kind: "gltf-scene",
      sourceUrl: "/assets/biocity/arnis-generated-context.glb",
    });
    expect(plan.recommendedConversion).toContain(
      "Keep simulation roads, hazards, walkable space, and collision in .csim.json",
    );
  });

  it("rejects oversized or invalid bounding boxes", () => {
    expect(() =>
      createArnisMapSourceConfig({
        bbox: {
          east: 121.9,
          north: 31.7,
          south: 31.1,
          west: 121.1,
        },
        outputDirectory: "E:/crowdsim-data/arnis/too-large",
      }),
    ).toThrow("exceeds recommended");

    expect(() =>
      createArnisMapSourceConfig({
        bbox: { east: 1, north: 0, south: 1, west: 0 },
        outputDirectory: "E:/crowdsim-data/arnis/bad",
      }),
    ).toThrow("south must be below north");
  });
});
