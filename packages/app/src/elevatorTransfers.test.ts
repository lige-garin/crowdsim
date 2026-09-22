import { describe, expect, it } from "vitest";
import { createRouter } from "./crowdNavigation";
import {
  createFloorGraph,
  elevatorCarFloorId,
  isOnShaftFlight,
  type ConnectorRuntime,
} from "./floorRouting";
import { isRiding, planFloorLegs } from "./floorTransfers";
import { createElevatorRuntime, stepElevatorTravel } from "./elevatorTransfers";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

const openFloor = createRouter({ width: 20, height: 20 }, []);

/** A single-car shaft: 2 s door dwell, 5 s ride — 9 s travelSeconds total,
 * matching `elevatorRideSeconds`'s own `travelSeconds - 2*doorSeconds`. */
function shaftConnectors(
  overrides: Partial<ConnectorRuntime> = {},
): ConnectorRuntime[] {
  const up: ConnectorRuntime = {
    id: "lift-1",
    shaftId: "lift-1",
    kind: "elevator",
    fromFloorId: "ground",
    fromPoint: { x: 5, y: 5 },
    toFloorId: "upper",
    toPoint: { x: 5, y: 5 },
    travelSeconds: 9,
    lengthMeters: 3,
    climbing: true,
    admitPerSecond: 1,
    width: 1.2,
    capacity: 2,
    carCount: 1,
    doorSeconds: 2,
    ...overrides,
  };
  const down: ConnectorRuntime = {
    ...up,
    id: "lift-1:down",
    fromFloorId: "upper",
    fromPoint: { x: 5, y: 5 },
    toFloorId: "ground",
    toPoint: { x: 5, y: 5 },
    climbing: false,
  };
  return [up, down];
}

const groundExit: SimulationSink = {
  id: "ground-exit",
  floorId: "ground",
  position: { x: 15, y: 15 },
  radius: 2,
};

const upperExit: SimulationSink = {
  id: "upper-exit",
  floorId: "upper",
  position: { x: 15, y: 15 },
  radius: 2,
};

function graphFor(connectors: readonly ConnectorRuntime[]) {
  return createFloorGraph({
    connectors,
    meanSpeedMetersPerSecond: 1.34,
    routerFor: (floorId) =>
      floorId === "ground" || floorId === "upper" ? openFloor : undefined,
  });
}

function waitingAgent(
  id: number,
  floorId: "ground" | "upper",
  shaftId: string,
  destinationFloorId: string,
): SimulationAgent {
  return {
    id,
    floorId,
    x: 5,
    y: 5,
    vx: 0,
    vy: 0,
    targetX: 5,
    targetY: 5,
    transfer: {
      connectorId: shaftId,
      shaftId,
      finalX: 15,
      finalY: 15,
      floorId: destinationFloorId,
    },
  };
}

describe("createElevatorRuntime", () => {
  it("gives each shaft carCount cars, idle at the from floor, doors closed", () => {
    const cars = createElevatorRuntime(shaftConnectors({ carCount: 2 }));
    // carCount lives on the scene-authored connector; both directional
    // entries in the fixture already carry it via the spread.
    const shaft = cars.get("lift-1")!;

    expect(shaft).toHaveLength(2);
    expect(shaft.every((car) => car.phase === "idle")).toBe(true);
    expect(shaft.every((car) => car.atFloorId === "ground")).toBe(true);
    expect(shaft.map((car) => car.carIndex)).toEqual([0, 1]);
  });

  it("pools both directions of one shaft onto the same cars, not two shafts", () => {
    const cars = createElevatorRuntime(shaftConnectors());
    expect(cars.size).toBe(1);
  });
});

describe("stepElevatorTravel", () => {
  const connectors = shaftConnectors();
  const graph = graphFor(connectors);

  it("boards someone waiting at the car's own floor for free, no travel", () => {
    const cars = createElevatorRuntime(connectors);
    const agent = waitingAgent(1, "ground", "lift-1", "upper");

    const stepped = stepElevatorTravel({
      agents: [agent],
      cars,
      connectors,
      graph,
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });

    const car = cars.get("lift-1")![0];
    expect(car.phase).toBe("boarding");
    expect(car.passengers).toEqual([1]);
    expect(isRiding(stepped[0])).toBe(true);
    expect(stepped[0].floorId).toBe(elevatorCarFloorId("lift-1", 0));
  });

  it("carries a boarded passenger through doors, ride and alighting, doors again", () => {
    const cars = createElevatorRuntime(connectors);
    let agents: SimulationAgent[] = [waitingAgent(1, "ground", "lift-1", "upper")];

    // t=0: doors open at ground, boards.
    agents = stepElevatorTravel({
      agents,
      cars,
      connectors,
      graph,
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });
    expect(cars.get("lift-1")![0].phase).toBe("boarding");

    // t=1: doors still open (doorSeconds=2).
    agents = stepElevatorTravel({
      agents,
      cars,
      connectors,
      graph,
      nowSeconds: 1,
      sinks: [groundExit, upperExit],
    });
    expect(cars.get("lift-1")![0].phase).toBe("boarding");
    expect(isRiding(agents[0])).toBe(true);

    // t=2: doors close, departs (passenger aboard).
    agents = stepElevatorTravel({
      agents,
      cars,
      connectors,
      graph,
      nowSeconds: 2,
      sinks: [groundExit, upperExit],
    });
    expect(cars.get("lift-1")![0].phase).toBe("moving");

    // t=6.9: still riding (rideSeconds=5, ready at 2+5=7).
    agents = stepElevatorTravel({
      agents,
      cars,
      connectors,
      graph,
      nowSeconds: 6.9,
      sinks: [groundExit, upperExit],
    });
    expect(isRiding(agents[0])).toBe(true);

    // t=7: arrives at upper, alights.
    agents = stepElevatorTravel({
      agents,
      cars,
      connectors,
      graph,
      nowSeconds: 7,
      sinks: [groundExit, upperExit],
    });
    const car = cars.get("lift-1")![0];
    expect(car.atFloorId).toBe("upper");
    expect(car.passengers).toEqual([]);
    expect(isRiding(agents[0])).toBe(false);
    expect(agents[0].floorId).toBe("upper");
    // Final destination reached: planFloorLegs clears the transfer.
    expect(agents[0].transfer).toBeUndefined();
  });

  it("keeps a car's floor a box a rider is pinned inside, not a corridor to walk", () => {
    const cars = createElevatorRuntime(connectors);
    const agent = waitingAgent(1, "ground", "lift-1", "upper");
    const [stepped] = stepElevatorTravel({
      agents: [agent],
      cars,
      connectors,
      graph,
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });

    expect(isOnShaftFlight(stepped.floorId, "lift-1")).toBe(true);
    expect(stepped.floorId).toBe(elevatorCarFloorId("lift-1", 0));
  });

  it("never boards more than capacity, and the rest wait for the next trip", () => {
    const cars = createElevatorRuntime(connectors); // capacity 2
    const agents: SimulationAgent[] = [
      waitingAgent(1, "ground", "lift-1", "upper"),
      waitingAgent(2, "ground", "lift-1", "upper"),
      waitingAgent(3, "ground", "lift-1", "upper"),
    ];

    const stepped = stepElevatorTravel({
      agents,
      cars,
      connectors,
      graph,
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });

    const car = cars.get("lift-1")![0];
    expect(car.passengers).toHaveLength(2);
    expect(stepped.filter((agent) => isRiding(agent))).toHaveLength(2);
    expect(stepped.filter((agent) => !isRiding(agent))).toHaveLength(1);
  });

  it("dispatches an idle car empty to fetch a call at the other floor", () => {
    const cars = createElevatorRuntime(connectors); // car starts at "ground"
    const agent = waitingAgent(1, "upper", "lift-1", "ground");

    const stepped = stepElevatorTravel({
      agents: [agent],
      cars,
      connectors,
      graph,
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });

    const car = cars.get("lift-1")![0];
    expect(car.phase).toBe("moving");
    expect(car.headingToFloorId).toBe("upper");
    // Not boarded yet: still walking/waiting on the real floor, the car has
    // to arrive first.
    expect(isRiding(stepped[0])).toBe(false);
  });

  it("gives a two-car shaft independent cars that do not share one box", () => {
    const twoCar = shaftConnectors({ carCount: 2 });
    const cars = createElevatorRuntime(twoCar);
    const first = waitingAgent(1, "ground", "lift-1", "upper");
    const graphTwoCar = graphFor(twoCar);

    // Car 0 boards and departs the ground floor.
    let agents = stepElevatorTravel({
      agents: [first],
      cars,
      connectors: twoCar,
      graph: graphTwoCar,
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });
    agents = stepElevatorTravel({
      agents,
      cars,
      connectors: twoCar,
      graph: graphTwoCar,
      nowSeconds: 2,
      sinks: [groundExit, upperExit],
    });
    expect(cars.get("lift-1")![0].phase).toBe("moving");

    // A second caller at ground is answered by the still-idle car 1, not
    // left waiting for car 0 to come back.
    const second = waitingAgent(2, "ground", "lift-1", "upper");
    agents = stepElevatorTravel({
      agents: [...agents, second],
      cars,
      connectors: twoCar,
      graph: graphTwoCar,
      nowSeconds: 2,
      sinks: [groundExit, upperExit],
    });

    const boardedBySecond = agents.find((agent) => agent.id === 2)!;
    expect(isRiding(boardedBySecond)).toBe(true);
    expect(boardedBySecond.floorId).toBe(elevatorCarFloorId("lift-1", 1));
    expect(boardedBySecond.floorId).not.toBe(
      agents.find((agent) => agent.id === 1)!.floorId,
    );
  });

  it("does nothing when the scene has no lift connectors", () => {
    const cars = createElevatorRuntime([]);
    const agent = waitingAgent(1, "ground", "lift-1", "upper");

    const stepped = stepElevatorTravel({
      agents: [agent],
      cars,
      connectors: [],
      graph: graphFor([]),
      nowSeconds: 0,
      sinks: [groundExit, upperExit],
    });

    expect(stepped[0]).toBe(agent);
  });
});

describe("planFloorLegs routes onto a lift the same way as a stair", () => {
  it("aims a walker at the shaft's own mouth and records its shaftId", () => {
    const connectors = shaftConnectors();
    const graph = graphFor(connectors);
    const walker: SimulationAgent = {
      id: 1,
      floorId: "ground",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      targetX: 15,
      targetY: 15,
      transfer: {
        connectorId: "",
        shaftId: "",
        finalX: 15,
        finalY: 15,
        floorId: "upper",
      },
    };

    const [planned] = planFloorLegs([walker], graph, [upperExit]);

    expect(planned.transfer?.shaftId).toBe("lift-1");
    expect(planned.targetX).toBe(5);
    expect(planned.targetY).toBe(5);
  });
});
