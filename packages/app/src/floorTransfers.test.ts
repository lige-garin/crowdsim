import { describe, expect, it } from "vitest";
import { createRouter } from "./crowdNavigation";
import { createFloorGraph, type ConnectorRuntime } from "./floorRouting";
import {
  createConnectorTraffic,
  planFloorLegs,
  stepConnectorTravel,
} from "./floorTransfers";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

const openFloor = createRouter({ width: 60, height: 40 }, []);

const stairs: ConnectorRuntime = {
  id: "stair-1",
  kind: "stair",
  fromFloorId: "upper",
  fromPoint: { x: 30, y: 20 },
  toFloorId: "ground",
  toPoint: { x: 30, y: 20 },
  travelSeconds: 13,
  admitPerSecond: 2,
};

const graph = createFloorGraph({
  connectors: [stairs],
  meanSpeedMetersPerSecond: 1.34,
  routerFor: () => openFloor,
});

const groundExit: SimulationSink = {
  id: "ground-exit",
  floorId: "ground",
  position: { x: 55, y: 20 },
  radius: 2,
};

const upperExit: SimulationSink = {
  id: "upper-exit",
  floorId: "upper",
  position: { x: 5, y: 20 },
  radius: 2,
};

function walker(overrides: Partial<SimulationAgent> = {}): SimulationAgent {
  return {
    id: 1,
    floorId: "upper",
    x: 10,
    y: 20,
    vx: 0,
    vy: 0,
    targetX: 55,
    targetY: 20,
    targetSinkId: "ground-exit",
    ...overrides,
  };
}

describe("legs of a journey between floors", () => {
  it("aims someone at the connector, keeping where they are really going", () => {
    const agent = walker({
      transfer: { connectorId: "", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const [planned] = planFloorLegs([agent], graph, [groundExit]);

    expect(planned.targetX).toBe(stairs.fromPoint.x);
    expect(planned.targetY).toBe(stairs.fromPoint.y);
    expect(planned.transfer).toEqual({
      connectorId: "stair-1",
      finalX: 55,
      finalY: 20,
      floorId: "ground",
    });
  });

  it("hands back the real target once they are on its floor", () => {
    const agent = walker({
      floorId: "ground",
      x: 30,
      y: 20,
      targetX: 30,
      targetY: 20,
      transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const [planned] = planFloorLegs([agent], graph, [groundExit]);

    expect(planned.transfer).toBeUndefined();
    expect(planned.targetX).toBe(55);
  });

  it("sends someone with no way to their floor to an exit on their own", () => {
    const agent = walker({
      transfer: { connectorId: "", finalX: 5, finalY: 5, floorId: "roof" },
    });
    const [planned] = planFloorLegs([agent], graph, [groundExit, upperExit]);

    expect(planned.transfer).toBeUndefined();
    expect(planned.targetSinkId).toBe("upper-exit");
  });

  it("leaves someone already on the treads alone", () => {
    const agent = walker({ ridingUntilSeconds: 40 });

    expect(planFloorLegs([agent], graph, [groundExit])[0]).toBe(agent);
  });
});

describe("stepping onto and off a connector", () => {
  const traffic = () => {
    const created = createConnectorTraffic([stairs]);
    created.replenish(1);
    return created;
  };

  const step = (agents: SimulationAgent[], elapsedSeconds: number, t = traffic()) =>
    stepConnectorTravel({
      agents,
      connectors: [stairs],
      elapsedSeconds,
      graph,
      sinks: [groundExit],
      traffic: t,
    });

  it("waits until someone is at the mouth of it", () => {
    const far = walker({
      x: 20,
      y: 20,
      transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
    });

    expect(step([far], 0)[0].ridingUntilSeconds).toBeUndefined();
  });

  it("holds them for as long as the flight takes", () => {
    const atMouth = walker({
      x: 30,
      y: 20,
      transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const [riding] = step([atMouth], 5);

    expect(riding.ridingUntilSeconds).toBe(5 + stairs.travelSeconds);
    expect(riding.floorId).toBe("upper");

    // Still travelling one second before it ends.
    expect(step([riding], 17)[0].floorId).toBe("upper");

    const [arrived] = step([riding], 5 + stairs.travelSeconds);

    expect(arrived.floorId).toBe("ground");
    expect(arrived.x).toBe(stairs.toPoint.x);
    expect(arrived.ridingUntilSeconds).toBeUndefined();
    // And they are pointed at what they came for.
    expect(arrived.targetX).toBe(55);
    expect(arrived.transfer).toBeUndefined();
  });

  it("takes only as many people a second as its width allows", () => {
    const crowd = Array.from({ length: 6 }, (_, index) =>
      walker({
        id: index + 1,
        x: 30,
        y: 20,
        transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
      }),
    );
    const stepped = step(crowd, 0);
    const boarded = stepped.filter(
      (agent) => agent.ridingUntilSeconds !== undefined,
    ).length;

    // Two a second at 2/s, and the rest wait at the foot of the stairs.
    expect(boarded).toBe(2);
    expect(
      stepped.filter((agent) => agent.ridingUntilSeconds === undefined),
    ).toHaveLength(4);
  });

  it("steps a stranded rider off where they are if the connector is edited away", () => {
    const riding = walker({
      ridingUntilSeconds: 1,
      transfer: { connectorId: "gone", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const [stepped] = stepConnectorTravel({
      agents: [riding],
      connectors: [],
      elapsedSeconds: 2,
      graph,
      sinks: [groundExit],
      traffic: createConnectorTraffic([]),
    });

    expect(stepped.ridingUntilSeconds).toBeUndefined();
    expect(stepped.transfer).toBeUndefined();
  });
});
