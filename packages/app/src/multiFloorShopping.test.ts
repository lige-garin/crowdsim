import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { createSimulationEngineFromScene } from "./simulationEngine";

/**
 * Shopping in a building with floors (ADR-0010).
 *
 * The case these guard is the one the whole feature is for: a shop on an upper
 * floor, reached by a staircase of a height a building really has. Every one of
 * them failed when the blocked-route rule counted the ride as a stalled walk,
 * and the floor tests beside them stayed green because they only ever followed
 * people to an exit.
 */

function mall({
  groupShare = 0,
  id,
  riseMeters = 4.5,
  upperExit = false,
}: {
  groupShare?: number;
  id: string;
  riseMeters?: number;
  upperExit?: boolean;
}): CrowdSimScene {
  return parseScene({
    ...demoScene,
    id,
    walls: [],
    shops: [
      {
        id: "upper-shop",
        floorId: "upper",
        position: { x: 40, y: 20 },
        size: { width: 8, height: 6 },
        capacity: 20,
        conversionRate: 1,
        dwellMeanSeconds: 15,
      },
    ],
    servicePoints: [
      {
        id: "upper-till",
        floorId: "upper",
        kind: "counter",
        position: { x: 46, y: 20 },
        width: 3,
        serviceMeanSeconds: 8,
        servers: 4,
      },
    ],
    floors: [
      { id: "ground", level: 0, elevationMeters: 0 },
      { id: "upper", level: 1, elevationMeters: riseMeters },
    ],
    entrances: [
      {
        id: "ground-door",
        floorId: "ground",
        kind: "source",
        position: { x: 5, y: 20 },
        width: 4,
        arrivalRatePerMinute: 60,
        groupShare,
      },
      {
        id: "ground-exit",
        floorId: "ground",
        kind: "sink",
        position: { x: 70, y: 20 },
        width: 5,
      },
      ...(upperExit
        ? [
            {
              id: "upper-exit",
              floorId: "upper",
              kind: "sink",
              position: { x: 70, y: 32 },
              width: 5,
            },
          ]
        : []),
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
}

/**
 * How long each case runs, and how many people are in it. 90 s covers the whole
 * trip — 15 m to the stairs, 14.7 s climbing them, 20 m to the shop — and a
 * crowd of 30 is enough to see it happen. Both are kept small on purpose: these
 * step a real simulation, and three heavy cases were enough to starve the
 * slower panel tests of a core and time them out.
 */
const runSeconds = 90;
const crowdSize = 30;

/** Runs the scene and reports the most that was ever true at one moment. */
function highWaterMarks(scene: CrowdSimScene, seconds: number) {
  const engine = createSimulationEngineFromScene(scene, { maxAgents: crowdSize });
  engine.start();
  const marks = { atTill: 0, browsing: 0, companionsUpstairs: 0, upstairs: 0 };

  for (let step = 0; step < seconds * 60; step += 1) {
    engine.step(1 / 60);

    if (step % 60 !== 0) {
      continue;
    }

    const agents = engine.snapshot().agents;
    const upstairs = agents.filter((agent) => agent.floorId === "upper");

    marks.upstairs = Math.max(marks.upstairs, upstairs.length);
    marks.browsing = Math.max(
      marks.browsing,
      agents.filter((agent) => agent.lifecycleState === "browse").length,
    );
    marks.atTill = Math.max(
      marks.atTill,
      agents.filter((agent) => agent.servicePointId !== undefined).length,
    );
    marks.companionsUpstairs = Math.max(
      marks.companionsUpstairs,
      upstairs.filter(
        (agent) => agent.groupId !== undefined && agent.groupId !== agent.id,
      ).length,
    );
  }

  return marks;
}

describe("shopping on an upper floor", () => {
  it(
    "gets people up a staircase of a height a building really has",
    { timeout: 20_000 },
    () => {
      // 4.5 m of rise is 14.7 s on the stairs — three times the stall rule's
      // patience, which is what used to empty the upper floor.
      const marks = highWaterMarks(mall({ id: "tall-flight" }), runSeconds);

      expect(marks.upstairs).toBeGreaterThan(0);
      expect(marks.browsing).toBeGreaterThan(0);
    },
  );

  it(
    "lets a buyer upstairs reach the till, exit on that floor or not",
    { timeout: 20_000 },
    () => {
      const marks = highWaterMarks(
        mall({ id: "till-run", upperExit: true }),
        runSeconds,
      );

      expect(marks.atTill).toBeGreaterThan(0);
    },
  );

  it("takes companions up with their leader", { timeout: 20_000 }, () => {
    const marks = highWaterMarks(mall({ id: "groups-run", groupShare: 1 }), runSeconds);

    expect(marks.companionsUpstairs).toBeGreaterThan(0);
  });
});
