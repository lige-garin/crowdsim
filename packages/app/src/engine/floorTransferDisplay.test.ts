import { describe, expect, it } from "vitest";
import type { ElevatorCarRuntime } from "./elevatorTransfers";
import {
  flightFloorId,
  flightLengthMeters,
  type ConnectorRuntime,
} from "./floorRouting";
import { riderDisplayPosition } from "./floorTransferDisplay";
import type { SimulationAgent } from "./simulationEngine";

const stairs: ConnectorRuntime = {
  id: "stair-1",
  shaftId: "stair-1",
  kind: "stair",
  fromFloorId: "upper",
  fromPoint: { x: 30, y: 20 },
  toFloorId: "ground",
  toPoint: { x: 30, y: 60 },
  travelSeconds: 13,
  lengthMeters: 9,
  climbing: true,
  admitPerSecond: 2,
  width: 1.6,
};

const lift: ConnectorRuntime = {
  id: "lift-1:up",
  shaftId: "lift-1",
  kind: "elevator",
  fromFloorId: "ground",
  fromPoint: { x: 5, y: 5 },
  toFloorId: "upper",
  toPoint: { x: 5, y: 45 },
  travelSeconds: 20,
  lengthMeters: 4,
  climbing: true,
  admitPerSecond: 1,
  width: 1.6,
  capacity: 8,
  carCount: 1,
};

const connectorsById = new Map<string, ConnectorRuntime>([
  [stairs.id, stairs],
  [lift.id, lift],
]);

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

describe("riderDisplayPosition — stair/escalator", () => {
  it("shows someone before the flight's midpoint at the departure floor's door", () => {
    const agent = walker({
      floorId: flightFloorId("stair-1"),
      x: 2,
      transfer: {
        connectorId: "stair-1",
        shaftId: "stair-1",
        finalX: 55,
        finalY: 20,
        floorId: "ground",
      },
    });

    const display = riderDisplayPosition(agent, connectorsById, new Map());

    expect(display).toEqual({ floorId: "upper", x: 30, y: 20 });
  });

  it("shows someone past the flight's midpoint at the arrival floor's door", () => {
    const agent = walker({
      floorId: flightFloorId("stair-1"),
      x: 7,
      transfer: {
        connectorId: "stair-1",
        shaftId: "stair-1",
        finalX: 55,
        finalY: 20,
        floorId: "ground",
      },
    });

    const display = riderDisplayPosition(agent, connectorsById, new Map());

    expect(display).toEqual({ floorId: "ground", x: 30, y: 60 });
  });

  it("switches at exactly the midpoint, not before", () => {
    const midpoint = flightLengthMeters(stairs) / 2;
    const before = riderDisplayPosition(
      walker({
        floorId: flightFloorId("stair-1"),
        x: midpoint - 0.01,
        transfer: {
          connectorId: "stair-1",
          shaftId: "stair-1",
          finalX: 0,
          finalY: 0,
          floorId: "ground",
        },
      }),
      connectorsById,
      new Map(),
    );
    const atMidpoint = riderDisplayPosition(
      walker({
        floorId: flightFloorId("stair-1"),
        x: midpoint,
        transfer: {
          connectorId: "stair-1",
          shaftId: "stair-1",
          finalX: 0,
          finalY: 0,
          floorId: "ground",
        },
      }),
      connectorsById,
      new Map(),
    );

    expect(before?.floorId).toBe("upper");
    expect(atMidpoint?.floorId).toBe("ground");
  });

  it("returns undefined for someone not mid-flight", () => {
    const agent = walker({ floorId: "upper" });

    expect(riderDisplayPosition(agent, connectorsById, new Map())).toBeUndefined();
  });
});

describe("riderDisplayPosition — elevator", () => {
  function car(overrides: Partial<ElevatorCarRuntime> = {}): ElevatorCarRuntime {
    return {
      shaftId: "lift-1",
      carIndex: 0,
      phase: "idle",
      atFloorId: "ground",
      readyAtSeconds: 0,
      passengers: [1],
      ...overrides,
    };
  }

  function rider(overrides: Partial<SimulationAgent> = {}): SimulationAgent {
    return walker({
      floorId: `${flightFloorId("lift-1")}:car0`,
      x: 1,
      y: 1,
      transfer: {
        connectorId: "lift-1:up",
        shaftId: "lift-1",
        finalX: 5,
        finalY: 45,
        floorId: "upper",
      },
      ...overrides,
    });
  }

  it("shows a boarding passenger at the floor the car is sitting at", () => {
    const cars = new Map([
      ["lift-1", [car({ phase: "boarding", atFloorId: "ground" })]],
    ]);

    const display = riderDisplayPosition(rider(), connectorsById, cars);

    expect(display).toEqual({ floorId: "ground", x: 5, y: 5 });
  });

  it("shows a moving passenger at the floor the car is heading to, not where it left", () => {
    const cars = new Map([
      [
        "lift-1",
        [car({ phase: "moving", atFloorId: "ground", headingToFloorId: "upper" })],
      ],
    ]);

    const display = riderDisplayPosition(rider(), connectorsById, cars);

    expect(display).toEqual({ floorId: "upper", x: 5, y: 45 });
  });

  it("returns undefined when the rider's car cannot be found (no passenger match)", () => {
    const cars = new Map([["lift-1", [car({ passengers: [999] })]]]);

    expect(riderDisplayPosition(rider(), connectorsById, cars)).toBeUndefined();
  });
});
