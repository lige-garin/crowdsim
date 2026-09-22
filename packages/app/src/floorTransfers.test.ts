import { describe, expect, it } from "vitest";
import { createRouter } from "./crowdNavigation";
import {
  createFloorGraph,
  flightFloorId,
  flightLengthMeters,
  personTravelSeconds,
  type ConnectorRuntime,
} from "./floorRouting";
import {
  createConnectorTraffic,
  isRiding,
  planFloorLegs,
  stepConnectorTravel,
} from "./floorTransfers";
import { applySimulationAgentDecisions } from "./simulationDecisionBackend";
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
  lengthMeters: 9,
  climbing: true,
  admitPerSecond: 2,
  width: 1.6,
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

/** A walker already placed on the stairs' own flight lane, at local `x`. */
function rider(
  localX: number,
  overrides: Partial<SimulationAgent> = {},
): SimulationAgent {
  return walker({
    floorId: flightFloorId("stair-1"),
    x: localX,
    y: stairs.width / 2,
    targetX: flightLengthMeters(stairs),
    targetY: stairs.width / 2,
    flightSpeedMetersPerSecond: 0.61,
    transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
    ...overrides,
  });
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
    const agent = rider(4.5);

    expect(planFloorLegs([agent], graph, [groundExit])[0]).toBe(agent);
  });
});

describe("stepping onto and off a connector", () => {
  const traffic = () => {
    const created = createConnectorTraffic([stairs]);
    created.replenish(1);
    return created;
  };

  const step = (agents: SimulationAgent[], t = traffic()) =>
    stepConnectorTravel({
      agents,
      connectors: [stairs],
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
    const [stepped] = step([far]);

    expect(isRiding(stepped)).toBe(false);
    expect(stepped.floorId).toBe("upper");
  });

  it("boards onto the flight's own lane once someone reaches the mouth", () => {
    const atMouth = walker({
      x: 30,
      y: 20,
      transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const [boarded] = step([atMouth]);

    expect(isRiding(boarded)).toBe(true);
    expect(boarded.floorId).toBe(flightFloorId("stair-1"));
    // Placed at the near end of the lane, aimed at the far one.
    expect(boarded.x).toBe(0);
    expect(boarded.targetX).toBe(flightLengthMeters(stairs));
    // Off the two side walls, not stacked on the centreline.
    expect(boarded.y).toBeGreaterThan(0);
    expect(boarded.y).toBeLessThan(stairs.width);
    expect(boarded.flightSpeedMetersPerSecond).toBeGreaterThan(0);
    // Still travelling one call later, not yet at the far mouth.
    expect(isRiding(step([boarded])[0])).toBe(true);
  });

  it("steps someone off once they reach the far mouth of the flight", () => {
    // stepCrowd is what actually walks a rider along the lane (crowdMovement);
    // this only has to prove the handoff once they get there.
    const almostThere = rider(flightLengthMeters(stairs) - 0.01);
    const [arrived] = step([almostThere]);

    expect(isRiding(arrived)).toBe(false);
    expect(arrived.floorId).toBe("ground");
    expect(arrived.x).toBe(stairs.toPoint.x);
    expect(arrived.flightSpeedMetersPerSecond).toBeUndefined();
    // And they are pointed at what they came for.
    expect(arrived.targetX).toBe(55);
    expect(arrived.transfer).toBeUndefined();
  });

  it("leaves a rider not yet at the far mouth exactly where stepCrowd put them", () => {
    const midFlight = rider(4.5);
    const [stepped] = step([midFlight]);

    expect(stepped).toBe(midFlight);
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
    const stepped = step(crowd);
    const boarded = stepped.filter(isRiding).length;

    // Two a second at 2/s, and the rest wait at the foot of the stairs.
    expect(boarded).toBe(2);
    expect(stepped.filter((agent) => !isRiding(agent))).toHaveLength(4);
  });

  it("steps a stranded rider off at their destination if the connector is edited away", () => {
    // simulationEngine's replaceGeometry evicts anyone on a lane that no
    // longer exists before this ever runs (the "standing" set), so this is a
    // defensive path, not one a scene edit can reach in practice — there is
    // no flight geometry left here to say where they physically were.
    const stranded = rider(4.5, {
      floorId: flightFloorId("gone"),
      transfer: { connectorId: "gone", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const [stepped] = stepConnectorTravel({
      agents: [stranded],
      connectors: [],
      graph,
      sinks: [groundExit],
      traffic: createConnectorTraffic([]),
    });

    expect(stepped.floorId).toBe("ground");
    expect(stepped.x).toBe(55);
    expect(stepped.transfer).toBeUndefined();
  });
});

describe("a decision that says nothing about floors", () => {
  it("is read as a target on the walker's own floor, not another one", () => {
    const upstairs = walker({ floorId: "upper", transfer: undefined });
    const [after] = applySimulationAgentDecisions(
      [upstairs],
      [{ agentId: upstairs.id, nextState: "checkout", target: { x: 46, y: 20 } }],
      1,
    );

    // It used to build a transfer whose floor was undefined: no connector
    // leads there, so planFloorLegs sent the buyer to an exit instead.
    expect(after.transfer).toBeUndefined();
    expect(after.targetX).toBe(46);
    expect(planFloorLegs([after], graph, [groundExit, upperExit])[0].targetX).toBe(46);
  });
});

describe("a flight takes as long as the person is slow", () => {
  const flight = { climbing: true, lengthMeters: 9, travelSeconds: 13 };

  it("times it at the person's own stair speed when they have one", () => {
    // IMO's slowest impaired group climbs at 0.23 m/s, its quickest men at 0.84.
    expect(personTravelSeconds(flight, { stairUpMetersPerSecond: 0.23 })).toBeCloseTo(
      9 / 0.23,
      6,
    );
    expect(personTravelSeconds(flight, { stairUpMetersPerSecond: 0.84 })).toBeCloseTo(
      9 / 0.84,
      6,
    );
  });

  it("uses the way they are going: up is not down", () => {
    const descending = { ...flight, climbing: false };
    const person = {
      stairUpMetersPerSecond: 0.28,
      stairDownMetersPerSecond: 0.34,
    };

    expect(personTravelSeconds(descending, person)).toBeLessThan(
      personTravelSeconds(flight, person),
    );
  });

  it("falls back to the connector's own time for anyone with no profile", () => {
    expect(personTravelSeconds(flight, {})).toBe(13);
  });

  it("boards someone slow at a lower flight speed than someone quick", () => {
    // A lower flightSpeedMetersPerSecond is what actually holds someone
    // longer now: stepCrowd walks the lane at whatever speed boarding gave
    // them (crowdMovement), rather than a precomputed duration.
    const slow = walker({
      x: 30,
      y: 20,
      stairUpMetersPerSecond: 0.23,
      stairDownMetersPerSecond: 0.29,
      transfer: { connectorId: "stair-1", finalX: 55, finalY: 20, floorId: "ground" },
    });
    const quick = { ...slow, id: 2, stairUpMetersPerSecond: 0.84 };
    const traffic = createConnectorTraffic([stairs]);
    traffic.replenish(1);

    const [steppedSlow, steppedQuick] = stepConnectorTravel({
      agents: [slow, quick],
      connectors: [stairs],
      graph,
      sinks: [groundExit],
      traffic,
    });

    expect(steppedSlow.flightSpeedMetersPerSecond!).toBeLessThan(
      steppedQuick.flightSpeedMetersPerSecond!,
    );
  });
});
