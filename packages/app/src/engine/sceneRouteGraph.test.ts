import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import {
  compileSceneRouteGraph,
  estimateSceneRouteInfluence,
  nearestSceneRouteNode,
} from "./sceneRouteGraph";

describe("sceneRouteGraph", () => {
  it("compiles roads, entrances, buildings, transit stops, and walkable spaces", () => {
    const graph = compileSceneRouteGraph(defaultDemoScene, 0);

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
    expect(nearestSceneRouteNode(graph, { x: 122, y: 72 })?.sourceId).toBe(
      "rain-market-bus-stop",
    );
  });

  it("adds active hazards and obstacles to blocked spaces", () => {
    const clear = compileSceneRouteGraph(defaultDemoScene, 300);
    const rainy = compileSceneRouteGraph(defaultDemoScene, 1200);

    expect(clear.activeHazardIds).toEqual([]);
    expect(rainy.activeHazardIds).toEqual(["curbside-pooling"]);
    expect(rainy.blockedSpaces.map((space) => space.sourceId)).toEqual(
      expect.arrayContaining(["umbrella-queue-rails", "curbside-pooling"]),
    );
  });

  it("raises route edge cost when a road is affected by an active hazard", () => {
    const clear = compileSceneRouteGraph(defaultDemoScene, 300);
    const rainy = compileSceneRouteGraph(defaultDemoScene, 1200);
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
    const influence = estimateSceneRouteInfluence(
      defaultDemoScene,
      { x: 98, y: 58 },
      1200,
    );

    expect(influence.routeCostMultiplier).toBeGreaterThan(1);
    expect(influence.riskScore).toBeGreaterThan(0);
    expect(influence.speedMultiplier).toBeLessThan(1);
  });

  it("raises road edge cost while a road close event is active", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      eventTimeline: {
        events: [
          {
            id: "close-avenue",
            kind: "roadClose",
            startsAtSeconds: 60,
            endsAtSeconds: 300,
            targetId: "rain-market-avenue",
          },
        ],
      },
    });
    const open = compileSceneRouteGraph(scene, 30);
    const closed = compileSceneRouteGraph(scene, 120);
    const openRoad = open.edges.find((edge) => edge.sourceId === "rain-market-avenue")!;
    const closedRoad = closed.edges.find(
      (edge) => edge.sourceId === "rain-market-avenue",
    )!;

    expect(closedRoad.cost).toBeGreaterThan(openRoad.cost * 50);
  });
});
