import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "../scenes/demoScene";
import { elevatorCarFloorId, isOnShaftFlight } from "./floorRouting";
import { createSimulationEngineFromScene } from "./simulationEngine";
import { sceneConnectorRuntimes } from "./simulationSceneConfig";

/**
 * A stacked building whose only way down is a lift, end to end — the same
 * shape `simulationFloors.test.ts` uses for a staircase, so a reader can
 * compare the two directly. `capacity: 3` keeps a small scene's queue
 * genuinely capacity-limited without needing hundreds of agents to see it.
 */
const stackedWithLift: CrowdSimScene = parseScene({
  ...demoScene,
  id: "stacked-lift-demo",
  shops: [],
  servicePoints: [],
  floors: [
    { id: "ground", level: 0, elevationMeters: 0 },
    { id: "upper", level: 1, elevationMeters: 4.5 },
  ],
  walls: [
    {
      id: "upper-wall",
      floorId: "upper",
      geometry: {
        type: "polyline",
        points: [
          { x: 2, y: 2 },
          { x: 60, y: 2 },
        ],
      },
    },
  ],
  entrances: [
    {
      id: "upper-door",
      floorId: "upper",
      kind: "source",
      position: { x: 10, y: 20 },
      width: 4,
      arrivalRatePerMinute: 240,
      groupShare: 0,
    },
    {
      id: "ground-exit",
      floorId: "ground",
      kind: "sink",
      position: { x: 60, y: 20 },
      width: 5,
    },
  ],
  connectors: [
    {
      id: "lift-1",
      kind: "elevator",
      from: { floorId: "upper", point: { x: 30, y: 20 } },
      to: { floorId: "ground", point: { x: 30, y: 20 } },
      capacity: 3,
      carCount: 1,
      doorSeconds: 2,
    },
  ],
});

function run(scene: CrowdSimScene, steps: number, maxAgents = 60) {
  const engine = createSimulationEngineFromScene(scene, { maxAgents });
  engine.start();

  for (let step = 0; step < steps; step += 1) {
    engine.step(1 / 60);
  }

  return engine;
}

describe("a building with a lift", () => {
  it("accepts the scene and builds one runtime connector each way, sharing a shaftId", () => {
    const connectors = sceneConnectorRuntimes(stackedWithLift);

    expect(connectors).toHaveLength(2);
    expect(connectors.every((connector) => connector.kind === "elevator")).toBe(true);
    expect(connectors[0].shaftId).toBe(connectors[1].shaftId);
    expect(connectors[0].shaftId).toBe("lift-1");
  });

  it("sends arrivals upstairs to the lift's own mouth, not straight at the ground exit", () => {
    const engine = run(stackedWithLift, 240);
    const upstairs = engine
      .snapshot()
      .agents.filter((agent) => agent.floorId === "upper");

    expect(upstairs.length).toBeGreaterThan(0);
    for (const agent of upstairs) {
      expect(agent.targetX).toBeCloseTo(30, 5);
      expect(agent.transfer?.floorId).toBe("ground");
    }
  });

  it("carries people down in the car, not by walking a lane", () => {
    const engine = run(stackedWithLift, 60 * 20);
    const agents = engine.snapshot().agents;

    // Someone aboard sits in the car's own box, addressable by shaftId — the
    // same isOnShaftFlight check a stair's rider satisfies, but this box is
    // small and enclosed rather than a corridor with a far end to walk to.
    const aboard = agents.filter((agent) => isOnShaftFlight(agent.floorId, "lift-1"));
    for (const agent of aboard) {
      expect(agent.floorId).toBe(elevatorCarFloorId("lift-1", 0));
    }
  });

  it("gets people out of the ground-floor exit via the lift", () => {
    const engine = run(stackedWithLift, 60 * 90);

    expect(engine.snapshot().exitedCount).toBeGreaterThan(0);
    expect(engine.snapshot().agents.some((agent) => agent.floorId === "ground")).toBe(
      true,
    );
  });

  it("does not count reaching the lift lobby as leaving the building", () => {
    const engine = run(stackedWithLift, 60 * 15);

    expect(engine.snapshot().exitedCount).toBe(0);
  });

  it("never carries more than the car's own capacity at once", () => {
    const engine = run(stackedWithLift, 60 * 30);
    const aboard = engine
      .snapshot()
      .agents.filter((agent) => isOnShaftFlight(agent.floorId, "lift-1"));

    expect(aboard.length).toBeLessThanOrEqual(3);
  });
});
