import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  createCommercialValidationBundle,
  renderCommercialValidationHtml,
} from "./commercialValidation";
import { generateStoreLotsForZone } from "./storeLotGeneration";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "commercial-report",
  name: "Commercial Report",
  seed: 14,
  world: { width: 70, height: 36 },
  entrances: [
    { id: "entry", kind: "source", position: { x: 2, y: 18 }, width: 4 },
    { id: "exit", kind: "sink", position: { x: 68, y: 18 }, width: 4 },
  ],
  zones: [
    {
      id: "cosmetics-zone",
      attraction: 0.82,
      category: "cosmetics",
      geometry: {
        type: "polygon",
        points: [
          { x: 10, y: 8 },
          { x: 42, y: 8 },
          { x: 42, y: 24 },
          { x: 10, y: 24 },
        ],
      },
    },
  ],
  environmentFactors: [{ id: "fog", kind: "fog", startsAtSeconds: 0, severity: 0.5 }],
});

describe("commercial validation", () => {
  it("summarizes generated stores, brands, route costs and environment risk", () => {
    const generated = generateStoreLotsForZone(scene, "cosmetics-zone").scene;
    const bundle = createCommercialValidationBundle(generated);
    const html = renderCommercialValidationHtml(bundle);

    expect(bundle.generatedStoreLotCount).toBeGreaterThan(0);
    expect(bundle.shopCount).toBe(bundle.brandProfileCount);
    expect(bundle.averageTopStoreProbability).toBeGreaterThan(0);
    expect(bundle.environmentRiskScore).toBeGreaterThan(0);
    expect(html).toContain("Commercial behavior validation");
    expect(html).toContain("Average top-store probability");
  });
});
