import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";
import {
  isTimeVaryingPrimitive,
  partitionBioCityPrimitives,
} from "./bioCityRenderLayers";

describe("partitionBioCityPrimitives (viewport layer split)", () => {
  it("keeps every non-hazard primitive in the structural layer", () => {
    const plan = createBioCityRenderPlan(bioCityDemoScene, 0);
    const layers = partitionBioCityPrimitives(plan.primitives);

    expect(layers.static.length).toBeGreaterThan(0);
    expect(layers.static.every((primitive) => primitive.kind !== "hazard")).toBe(true);
    expect(layers.dynamic.every((primitive) => primitive.kind === "hazard")).toBe(true);
    expect(layers.static.length + layers.dynamic.length).toBe(plan.primitives.length);
  });

  it("proves the split is sound: static primitives are identical over time", () => {
    // The whole point of the split is that rebuilding the structural layer on
    // a clock tick is wasted work. If this ever fails, the offending kind must
    // move into `isTimeVaryingPrimitive` rather than the assertion be relaxed.
    const early = partitionBioCityPrimitives(
      createBioCityRenderPlan(bioCityDemoScene, 0).primitives,
    ).static;
    const late = partitionBioCityPrimitives(
      createBioCityRenderPlan(bioCityDemoScene, 900).primitives,
    ).static;

    expect(late).toEqual(early);
  });

  it("classifies hazards as time-varying", () => {
    expect(
      isTimeVaryingPrimitive({
        color: "#f97316",
        id: "hazard-1",
        kind: "hazard",
        opacity: 0.16,
        position: { x: 0, y: 0 },
        radiusMeters: 4,
      }),
    ).toBe(true);
    expect(
      isTimeVaryingPrimitive({
        color: "#64748b",
        end: { x: 1, y: 1 },
        id: "road-1",
        kind: "road",
        start: { x: 0, y: 0 },
        widthMeters: 6,
      }),
    ).toBe(false);
  });
});
