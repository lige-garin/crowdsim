import { describe, expect, it } from "vitest";
import { createRouter } from "./crowdNavigation";
import {
  connectorSpeeds,
  connectorTravelSeconds,
  createFloorGraph,
  type ConnectorRuntime,
} from "./floorRouting";

const openFloor = createRouter({ width: 60, height: 40 }, []);

function connector(overrides: Partial<ConnectorRuntime> = {}): ConnectorRuntime {
  return {
    id: "stair-1",
    kind: "stair",
    fromFloorId: "ground",
    fromPoint: { x: 30, y: 20 },
    toFloorId: "upper",
    toPoint: { x: 30, y: 20 },
    travelSeconds: connectorTravelSeconds("stair", 4.5),
    lengthMeters: 9,
    climbing: true,
    admitPerSecond: 2,
    ...overrides,
  };
}

const graph = (connectors: readonly ConnectorRuntime[]) =>
  createFloorGraph({
    connectors,
    meanSpeedMetersPerSecond: 1.34,
    routerFor: (floorId) =>
      floorId === "ground" || floorId === "upper" ? openFloor : undefined,
  });

describe("how long a connector takes", () => {
  it("climbs twice the height, because a flight is pitched at 30 degrees", () => {
    // 4.5 m of rise is 9 m of flight at 30 degrees.
    expect(connectorTravelSeconds("stair", 4.5)).toBeCloseTo(
      9 / connectorSpeeds.stairUp,
      6,
    );
    expect(connectorTravelSeconds("escalator", 4.5)).toBeCloseTo(
      9 / connectorSpeeds.escalator,
      6,
    );
  });

  it("is quicker going down a staircase than up one", () => {
    expect(connectorTravelSeconds("stair", -4.5)).toBeLessThan(
      connectorTravelSeconds("stair", 4.5),
    );
  });

  it("takes a declared speed over the typical one", () => {
    expect(connectorTravelSeconds("escalator", 4.5, 0.75)).toBeCloseTo(9 / 0.75, 6);
  });

  it("never makes a connector free, however little it rises", () => {
    expect(connectorTravelSeconds("stair", 0)).toBe(1);
  });
});

describe("routing between floors", () => {
  it("routes within a floor without involving a connector", () => {
    const routes = graph([connector()]);
    const from = { x: 5, y: 20, floorId: "ground" };
    const to = { x: 45, y: 20, floorId: "ground" };

    expect(routes.distance(from, to)).toBeCloseTo(40, 0);
    expect(routes.nextConnector(from, to)).toBeNull();
  });

  it("charges the walk to the stairs, the climb, and the walk at the top", () => {
    const routes = graph([connector()]);
    const cost = routes.distance(
      { x: 10, y: 20, floorId: "ground" },
      { x: 50, y: 20, floorId: "upper" },
    );
    const ride = connectorTravelSeconds("stair", 4.5) * 1.34;

    // 20 m to the stairs, the climb, then 20 m from them.
    expect(cost).toBeGreaterThan(40);
    expect(cost).toBeCloseTo(40 + ride, 0);
  });

  it("names the connector to head for", () => {
    const near = connector({ id: "near", fromPoint: { x: 12, y: 20 } });
    const far = connector({ id: "far", fromPoint: { x: 55, y: 20 } });
    const routes = graph([near, far]);

    expect(
      routes.nextConnector(
        { x: 10, y: 20, floorId: "ground" },
        { x: 10, y: 20, floorId: "upper" },
      )?.id,
    ).toBe("near");
  });

  it("prefers a slow escalator over a long detour, and says so in metres", () => {
    const stairs = connector({
      id: "stairs",
      fromPoint: { x: 55, y: 38 },
      toPoint: { x: 55, y: 38 },
    });
    const escalator = connector({
      id: "escalator",
      kind: "escalator",
      fromPoint: { x: 6, y: 20 },
      toPoint: { x: 6, y: 20 },
      travelSeconds: connectorTravelSeconds("escalator", 4.5),
    });
    const routes = graph([stairs, escalator]);

    expect(
      routes.nextConnector(
        { x: 5, y: 20, floorId: "ground" },
        { x: 5, y: 20, floorId: "upper" },
      )?.id,
    ).toBe("escalator");
  });

  it("climbs two floors by changing connectors on the way", () => {
    const routes = graph([
      connector({ id: "lower" }),
      connector({
        id: "higher",
        fromFloorId: "upper",
        toFloorId: "top",
        fromPoint: { x: 32, y: 20 },
        toPoint: { x: 32, y: 20 },
      }),
    ]);
    // The top floor has a router too in this case.
    const routesWithTop = createFloorGraph({
      connectors: routes.connectors,
      meanSpeedMetersPerSecond: 1.34,
      routerFor: () => openFloor,
    });
    const from = { x: 10, y: 20, floorId: "ground" };
    const to = { x: 40, y: 20, floorId: "top" };

    expect(routesWithTop.nextConnector(from, to)?.id).toBe("lower");
    expect(Number.isFinite(routesWithTop.distance(from, to))).toBe(true);
  });

  it("reports a floor with no way to it as unreachable, rather than near", () => {
    const routes = graph([connector()]);

    expect(
      routes.distance(
        { x: 10, y: 20, floorId: "ground" },
        { x: 10, y: 20, floorId: "roof" },
      ),
    ).toBe(Infinity);
    expect(
      routes.nextConnector(
        { x: 10, y: 20, floorId: "ground" },
        { x: 10, y: 20, floorId: "roof" },
      ),
    ).toBeNull();
  });

  it("walks normally in a scene with no floors at all", () => {
    const routes = createFloorGraph({
      connectors: [],
      meanSpeedMetersPerSecond: 1.34,
      routerFor: () => openFloor,
    });

    expect(routes.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 0);
  });
});
