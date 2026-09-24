import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { flightFloorId, flightLengthMeters } from "./floorRouting";
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
    // Everyone is either walking a real floor or on the stairs' own flight
    // lane (ADR-0010 stage 5) — never halfway between floors with nowhere to
    // be, and never past the far end of the flight they are on.
    const flightLength = flightLengthMeters(sceneConnectorRuntimes(stacked)[0]);
    for (const agent of snapshot.agents) {
      if (agent.floorId === flightFloorId("stair-1")) {
        expect(agent.x).toBeGreaterThanOrEqual(0);
        expect(agent.x).toBeLessThanOrEqual(flightLength);
      } else {
        expect(["ground", "upper"]).toContain(agent.floorId);
      }
    }
  });

  it("gets people out of a door on a floor they did not arrive on", () => {
    const engine = run(stacked, 60 * 120);

    expect(engine.snapshot().exitedCount).toBeGreaterThan(0);
  }, 30_000);

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

describe("an edit that deletes a floor people are on", () => {
  const twoFloors = parseScene({
    ...demoScene,
    id: "floor-deletion",
    walls: [],
    shops: [],
    servicePoints: [],
    floors: [
      { id: "ground", level: 0, elevationMeters: 0 },
      { id: "upper", level: 1, elevationMeters: 0.2 },
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
        position: { x: 70, y: 20 },
        width: 5,
      },
    ],
    connectors: [
      {
        id: "stair-1",
        kind: "stair",
        from: { floorId: "ground", point: { x: 20, y: 20 } },
        to: { floorId: "upper", point: { x: 20, y: 20 } },
        width: 2,
        bidirectional: true,
      },
    ],
  });

  /** The same building with that floor, and everything on it, taken away. */
  const groundOnly = parseScene({
    ...twoFloors,
    floors: [{ id: "ground", level: 0, elevationMeters: 0 }],
    entrances: twoFloors.entrances.map((entrance) => ({
      ...entrance,
      floorId: "ground",
    })),
    connectors: [],
  });

  it("takes them out of the run at the edit, and not as exits", () => {
    const engine = createSimulationEngineFromScene(twoFloors, { maxAgents: 80 });
    engine.start();
    for (let step = 0; step < 60 * 30; step += 1) engine.step(1 / 60);

    const before = engine.snapshot();
    const upstairs = before.agents.filter((agent) => agent.floorId === "upper").length;

    expect(upstairs).toBeGreaterThan(0);

    const upstairsIds = new Set(
      before.agents.filter((agent) => agent.floorId === "upper").map((a) => a.id),
    );
    const swapped = engine.updateScene(groundOnly);

    // Gone at the swap, where the count can be seen to drop — not one step
    // later with no explanation, which is what the per-floor step used to do.
    expect(swapped.agents.some((agent) => upstairsIds.has(agent.id))).toBe(false);
    expect(swapped.agents.every((agent) => agent.floorId === "ground")).toBe(true);
    expect(swapped.agentCount).toBeLessThan(before.agentCount);
    // Nobody walked out, so nobody is counted as having walked out.
    expect(swapped.exitedCount).toBe(before.exitedCount);
  });
});

describe("a stair rider's display position", () => {
  /** Same building as `stacked`, but the stair's two mouths sit at visibly
   * different points — `stacked` itself happens to reuse {30, 20} for both,
   * which cannot distinguish "shown at the departure door" from "shown at
   * the arrival door" by coordinate alone. */
  const stackedDistinctStairPoints: CrowdSimScene = parseScene({
    ...stacked,
    id: "stacked-distinct-stair-points",
    connectors: [
      {
        id: "stair-1",
        kind: "stair",
        from: { floorId: "upper", point: { x: 30, y: 20 } },
        to: { floorId: "ground", point: { x: 30, y: 25 } },
        width: 1.6,
        bidirectional: true,
      },
    ],
  });

  /** Steps a fresh engine, sampling a snapshot after every step — unlike
   * `run()`, which only returns the final state after stepping silently — so
   * a rider who is only mid-flight for a handful of steps is not missed. */
  function stepAndSampleEvery(scene: CrowdSimScene, steps: number, maxAgents: number) {
    const engine = createSimulationEngineFromScene(scene, { maxAgents });
    engine.start();
    const snapshots = [];
    for (let step = 0; step < steps; step += 1) {
      snapshots.push(engine.step(1 / 60));
    }
    return snapshots;
  }

  it("still carries the flight's own synthetic floorId, untouched, for anything timing the flight itself", () => {
    const snapshots = stepAndSampleEvery(stackedDistinctStairPoints, 60 * 20, 200);

    const sawFlightFloorId = snapshots.some((snapshot) =>
      snapshot.agents.some((agent) => agent.floorId === flightFloorId("stair-1")),
    );

    // The RiMEA stair-speed tests (test02_03StairSpeed) time a crossing by
    // watching exactly this transition — `display` must be additive, not a
    // replacement, or those tests silently stop measuring anything.
    expect(sawFlightFloorId).toBe(true);
  });

  it("gives every agent a `display` that resolves to a real floor, never undefined for someone off any real floor and never the flight's own id", () => {
    const snapshots = stepAndSampleEvery(stackedDistinctStairPoints, 60 * 20, 200);

    const seenDisplayFloorIds = new Set<string | undefined>();
    for (const snapshot of snapshots) {
      for (const agent of snapshot.agents) {
        if (agent.display !== undefined) {
          seenDisplayFloorIds.add(agent.display.floorId);
        }
      }
    }

    // At least one rider was seen with a resolved display, and every one of
    // them resolved to a real floor.
    expect(seenDisplayFloorIds.size).toBeGreaterThan(0);
    for (const floorId of seenDisplayFloorIds) {
      expect(floorId === "upper" || floorId === "ground").toBe(true);
    }
  });

  it("shows someone genuinely mid-flight at one of the stair's own door points via `display`", () => {
    const snapshots = stepAndSampleEvery(stackedDistinctStairPoints, 60 * 20, 200);

    let sawDeparturePoint = false;
    let sawArrivalPoint = false;
    for (const snapshot of snapshots) {
      for (const agent of snapshot.agents) {
        if (agent.display === undefined) {
          continue;
        }
        if (agent.display.x === 30 && agent.display.y === 20) {
          sawDeparturePoint = true;
        }
        if (agent.display.x === 30 && agent.display.y === 25) {
          sawArrivalPoint = true;
        }
      }
    }

    // Both ends seen proves the override fires for a real rider on both
    // sides of the midpoint, not just that nobody ever boarded the stairs.
    expect(sawDeparturePoint).toBe(true);
    expect(sawArrivalPoint).toBe(true);
  });
});
