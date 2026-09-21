import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { createSimulationEngineFromScene } from "./simulationEngine";
import {
  deriveSceneGeometry,
  sceneConnectorRuntimes,
  sceneFloorGeometries,
} from "./simulationSceneConfig";

/**
 * A stacked building, end to end: people arrive upstairs, and the only way out
 * is a staircase down to a door on the ground floor.
 */
const stacked: CrowdSimScene = parseScene({
  ...demoScene,
  id: "stacked-demo",
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
      arrivalRatePerMinute: 120,
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
      id: "stair-1",
      kind: "stair",
      from: { floorId: "upper", point: { x: 30, y: 20 } },
      to: { floorId: "ground", point: { x: 30, y: 20 } },
      width: 1.6,
      bidirectional: true,
    },
  ],
});

function run(scene: CrowdSimScene, steps: number, maxAgents = 200) {
  const engine = createSimulationEngineFromScene(scene, { maxAgents });
  engine.start();

  for (let step = 0; step < steps; step += 1) {
    engine.step(1 / 60);
  }

  return engine;
}

describe("a building with floors", () => {
  it("gives each floor its own plane, with only its own walls on it", () => {
    const floors = sceneFloorGeometries(stacked);

    expect(floors.map((floor) => floor.id)).toEqual(["ground", "upper"]);
    expect(floors[0].walls).toHaveLength(0);
    expect(floors[1].walls.length).toBeGreaterThan(0);
  });

  it("is one unnamed plane when the scene declares no floors", () => {
    const floors = sceneFloorGeometries(demoScene);

    expect(floors).toHaveLength(1);
    expect(floors[0].id).toBeUndefined();
  });

  it("turns a two-way staircase into one connector each way", () => {
    const connectors = sceneConnectorRuntimes(stacked);

    expect(connectors.map((connector) => connector.fromFloorId)).toEqual([
      "upper",
      "ground",
    ]);
    // The declared direction here is down, and going down is the quicker of
    // the two. Both take real time: 4.5 m of rise is a 9 m flight.
    expect(connectors[0].travelSeconds).toBeLessThan(connectors[1].travelSeconds);
    expect(connectors[0].travelSeconds).toBeGreaterThan(10);
  });

  it("puts arrivals on the floor of the entrance they came through", () => {
    const engine = run(stacked, 120);
    const agents = engine.snapshot().agents;

    expect(agents.length).toBeGreaterThan(0);
    expect(agents.some((agent) => agent.floorId === "upper")).toBe(true);
  });

  it("sends them to the staircase, not straight at the exit below", () => {
    const engine = run(stacked, 240);
    const upstairs = engine
      .snapshot()
      .agents.filter((agent) => agent.floorId === "upper");

    expect(upstairs.length).toBeGreaterThan(0);
    // Their leg is the stair mouth at x=30, not the door at x=60.
    for (const agent of upstairs) {
      expect(agent.targetX).toBeCloseTo(30, 5);
      expect(agent.transfer?.floorId).toBe("ground");
    }
  });

  it("holds people on the stairs for the time the climb takes, then puts them down", () => {
    const engine = run(stacked, 60 * 40);
    const snapshot = engine.snapshot();

    expect(snapshot.agents.some((agent) => agent.floorId === "ground")).toBe(true);
    // Nobody is halfway between floors in the crowd: they are either walking a
    // floor or riding, and a rider stands at the mouth they stepped on at.
    for (const agent of snapshot.agents) {
      if (agent.ridingUntilSeconds !== undefined) {
        expect(agent.x).toBeCloseTo(30, 5);
      }
    }
  });

  it("gets people out of a door on a floor they did not arrive on", () => {
    const engine = run(stacked, 60 * 120);

    expect(engine.snapshot().exitedCount).toBeGreaterThan(0);
  });

  it("does not count reaching the stairs as leaving the building", () => {
    // Twenty seconds in, people are on their way to the stairs and no one can
    // have climbed down and crossed the ground floor yet.
    const engine = run(stacked, 60 * 20);

    expect(engine.snapshot().exitedCount).toBe(0);
  });

  it("keeps the crowds of two floors apart", () => {
    const geometry = deriveSceneGeometry(stacked, {}, () => 0.5);

    expect(geometry.floors).toHaveLength(2);
    expect(geometry.connectors).toHaveLength(2);
    expect(geometry.sources[0].floorId).toBe("upper");
    expect(geometry.sinks[0].floorId).toBe("ground");
  });

  it("leaves a one-floor scene running exactly as it did", () => {
    const engine = run(demoScene, 600);
    const snapshot = engine.snapshot();

    expect(snapshot.agentCount).toBeGreaterThan(0);
    expect(snapshot.agents.every((agent) => agent.floorId === undefined)).toBe(true);
    expect(snapshot.agents.every((agent) => agent.transfer === undefined)).toBe(true);
  });
});
