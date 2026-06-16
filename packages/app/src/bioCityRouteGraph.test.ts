import { describe, expect, it } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  compileBioCityRouteGraph,
  estimateBioCityRouteInfluence,
  nearestBioCityRouteNode,
} from "./bioCityRouteGraph";

describe("bioCityRouteGraph", () => {
  it("compiles roads, entrances, buildings, transit stops, and walkable spaces", () => {
    const graph = compileBioCityRouteGraph(bioCityDemoScene, 0);

    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        "roadEndpoint",
        "entrance",
        "buildingEntrance",
        "transitStop",
      ]),
    );
    expect(graph.edges.map((edge) => edge.sourceId)).toEqual(
      expect.arrayContaining(["rain-market-avenue", "bus-loop"]),
    );
    expect(
      graph.walkableSpaces.some((space) => space.sourceId === "downtown-walkable"),
    ).toBe(true);
    expect(nearestBioCityRouteNode(graph, { x: 122, y: 72 })?.sourceId).toBe(
      "rain-market-bus-stop",
    );
  });

  it("adds active hazards and obstacles to blocked spaces", () => {
    const clear = compileBioCityRouteGraph(bioCityDemoScene, 300);
    const rainy = compileBioCityRouteGraph(bioCityDemoScene, 1200);

    expect(clear.activeHazardIds).toEqual([]);
    expect(rainy.activeHazardIds).toEqual(["curbside-pooling"]);
    expect(rainy.blockedSpaces.map((space) => space.sourceId)).toEqual(
      expect.arrayContaining(["umbrella-queue-rails", "curbside-pooling"]),
    );
  });

  it("raises route edge cost when a road is affected by an active hazard", () => {
    const clear = compileBioCityRouteGraph(bioCityDemoScene, 300);
    const rainy = compileBioCityRouteGraph(bioCityDemoScene, 1200);
    const clearRoad = clear.edges.find(
      (edge) => edge.sourceId === "rain-market-avenue",
    )!;
    const rainyRoad = rainy.edges.find(
      (edge) => edge.sourceId === "rain-market-avenue",
    )!;

    expect(rainyRoad.cost).toBeGreaterThan(clearRoad.cost);
    expect(rainyRoad.riskScore).toBeGreaterThan(clearRoad.riskScore);
  });

  it("estimates local hazard and obstacle influence at a point", () => {
    const influence = estimateBioCityRouteInfluence(
      bioCityDemoScene,
      { x: 98, y: 58 },
      1200,
    );

    expect(influence.routeCostMultiplier).toBeGreaterThan(1);
    expect(influence.riskScore).toBeGreaterThan(0);
    expect(influence.speedMultiplier).toBeLessThan(1);
  });
});
