import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  createSimulationEngine,
  createSimulationEngineFromScene,
} from "./simulationEngine";
import { weidmannMaxSpecificFlow } from "./pedestrianFundamentalDiagram";
import type { SimulationDecisionBackend } from "./simulationDecisionBackend";

const source = {
  id: "entry",
  position: { x: 0, y: 0 },
  width: 2,
  arrivalRatePerSecond: 60,
};
const sink = {
  id: "exit",
  position: { x: 10, y: 0 },
  radius: 0.5,
};

describe("simulation engine", () => {
  it("does not advance while paused", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 1,
      seed: 7,
      sources: [source],
      sinks: [sink],
    });

    const before = engine.snapshot();
    const after = engine.tick(10);

    expect(after.elapsedSeconds).toBe(before.elapsedSeconds);
    expect(after.agentCount).toBe(0);
    expect(after.spawnedCount).toBe(0);
  });

  it("runs fixed-step simulation with time scale", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 0.5,
      seed: 11,
      sources: [source],
      sinks: [sink],
    });

    engine.setTimeScale(4);
    engine.start();
    const snapshot = engine.tick(0.25);

    expect(snapshot.stepCount).toBe(2);
    expect(snapshot.elapsedSeconds).toBe(1);
    expect(snapshot.spawnedCount).toBeGreaterThan(0);
  });

  it("applies decision backend output at the configured decision tick", () => {
    const decisionBackend = createTargetDecisionBackend();
    const engine = createSimulationEngine({
      decisionBackend,
      fixedDtSeconds: 1 / 60,
      seed: 11,
      sources: [
        {
          ...source,
          arrivalRatePerSecond: 6000,
        },
      ],
      sinks: [sink],
      speedMetersPerSecond: 0,
    });

    engine.start();
    const beforeDecision = engine.step(5);

    expect(decisionBackend.calls).toBe(0);
    expect(beforeDecision.agents.every((agent) => !agent.lifecycleState)).toBe(true);

    const afterDecision = engine.step(1);

    expect(decisionBackend.calls).toBe(1);
    expect(afterDecision.agents.length).toBeGreaterThan(0);
    expect(
      afterDecision.agents.every(
        (agent) =>
          agent.decisionTick === 1 &&
          agent.lifecycleState === "enterStore" &&
          agent.selectedStoreId === "shop-a" &&
          agent.targetX === 3 &&
          agent.targetY === 4,
      ),
    ).toBe(true);
  });

  it("does not run the decision backend while paused", () => {
    const decisionBackend = createTargetDecisionBackend();
    const engine = createSimulationEngine({
      decisionBackend,
      fixedDtSeconds: 1 / 60,
      seed: 11,
      sources: [source],
      sinks: [sink],
    });

    engine.tick(1);

    expect(decisionBackend.calls).toBe(0);
    expect(engine.snapshot().stepCount).toBe(0);
  });

  it("removes agents once they reach a sink", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 1,
      seed: 19,
      sources: [
        {
          ...source,
          arrivalRatePerSecond: 1,
        },
      ],
      sinks: [sink],
      speedMetersPerSecond: 20,
    });

    engine.start();
    engine.step(4);
    const snapshot = engine.step(1);

    expect(snapshot.spawnedCount).toBeGreaterThan(0);
    expect(snapshot.exitedCount).toBeGreaterThan(0);
    expect(snapshot.agentCount).toBe(snapshot.spawnedCount - snapshot.exitedCount);
  });

  it("resets to a reproducible seeded state", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 1,
      seed: 23,
      sources: [source],
      sinks: [sink],
    });

    engine.start();
    const firstRun = engine.step(3);
    engine.reset();
    engine.start();
    const secondRun = engine.step(3);

    expect(secondRun).toMatchObject({
      elapsedSeconds: firstRun.elapsedSeconds,
      stepCount: firstRun.stepCount,
      spawnedCount: firstRun.spawnedCount,
      exitedCount: firstRun.exitedCount,
      agentCount: firstRun.agentCount,
    });
    expect(secondRun.agents.map((agent) => agent.y)).toEqual(
      firstRun.agents.map((agent) => agent.y),
    );
  });

  it("keeps arrivals through a bidirectional entrance in the scene", () => {
    const engine = createSimulationEngineFromScene(
      mallScene({
        entrances: [
          {
            id: "gate",
            kind: "bidirectional",
            position: { x: 10, y: 40 },
            width: 6,
            arrivalRatePerMinute: 600,
            groupShare: 0,
          },
        ],
      }),
    );

    const snapshot = engine.step(60);

    // The gate is a sink too, and spawn jitter puts a newborn inside its radius:
    // nobody may be counted as having left before walking anywhere.
    expect(snapshot.spawnedCount).toBeGreaterThan(0);
    expect(snapshot.exitedCount).toBe(0);
    expect(snapshot.agentCount).toBe(snapshot.spawnedCount);
  });

  it("keeps an under-capacity mall flowing instead of deadlocking in the queue", () => {
    const crowdedScene = () =>
      mallScene({
        // 1 arrival a second against a 200 cap is genuinely under capacity;
        // the 5/s this fixture used only drained because agents used to walk
        // through each other at a fixed 8 m/s.
        entrances: [
          {
            id: "gate",
            kind: "source",
            position: { x: 5, y: 40 },
            width: 6,
            arrivalRatePerMinute: 60,
            groupShare: 0,
          },
          ...mallExits,
        ],
        shops: [
          {
            id: "shop-a",
            name: "A",
            position: { x: 40, y: 40 },
            size: { width: 8, height: 8 },
            attraction: 1,
            capacity: 1,
            dwellMeanSeconds: 600,
          },
        ],
      });
    const engine = createSimulationEngineFromScene(crowdedScene(), {
      maxAgents: 200,
    });

    const snapshot = engine.step(60 * 120);

    // One service slot and a 10 minute dwell: the line has to shed shoppers or
    // the whole mall stops at the agent cap.
    expect(snapshot.exitedCount).toBeGreaterThan(0);
    expect(snapshot.agentCount).toBeLessThan(200);

    // Renege patience and the fallback store choice must stay seed-driven.
    const replay = createSimulationEngineFromScene(crowdedScene(), {
      maxAgents: 200,
    });

    expect(replay.step(60 * 120)).toEqual(snapshot);
  });

  it("gives up on a shop the walls cut off instead of stalling forever", () => {
    const engine = createSimulationEngineFromScene(
      mallScene({
        // Two parallel walls: an agent that slips through one still faces the
        // other, so the shop is genuinely unreachable and the exit is not.
        walls: [wall("wall-a", 25), wall("wall-b", 26)],
        shops: [
          {
            id: "shop-a",
            name: "A",
            position: { x: 60, y: 40 },
            size: { width: 8, height: 8 },
            attraction: 1,
            capacity: 50,
            dwellMeanSeconds: 30,
          },
        ],
      }),
      // The 5 arrivals/second vs cap-224 balance was tuned at 8 m/s walking;
      // this test pins the route give-up behaviour, not the speed, so keep the
      // legacy pace explicitly instead of re-tuning the fixture around 1.34.
      { maxAgents: 224, speedMetersPerSecond: 8 },
    );

    const firstHalf = engine.step(60 * 150);
    const secondHalf = engine.step(60 * 150);

    // Shoppers that cannot reach the shop must give up and leave, so the scene
    // keeps draining and refilling instead of freezing at the agent cap.
    expect(firstHalf.exitedCount).toBeGreaterThan(0);
    expect(secondHalf.exitedCount).toBeGreaterThan(firstHalf.exitedCount);
    expect(secondHalf.spawnedCount).toBeGreaterThan(firstHalf.spawnedCount);
    expect(secondHalf.agentCount).toBeLessThan(224);
    // Density coupling makes this spec genuinely heavy: ~2-3s alone and
    // several times that under a parallel full-suite run, so the 5s default
    // made it a coin flip rather than a signal. Same treatment as the
    // panel-dock data-source spec.
  }, 30_000);

  it("keeps wall-constrained scene agents from crossing blocked geometry", () => {
    const scene = parseScene({
      schemaVersion: "1.0.0",
      id: "wall-stop",
      name: "Wall Stop",
      units: "meters",
      seed: 31,
      world: { width: 10, height: 10 },
      walls: [
        {
          id: "middle-wall",
          geometry: {
            type: "polyline",
            points: [
              { x: 5, y: 0 },
              { x: 5, y: 10 },
            ],
          },
          thickness: 0.2,
        },
      ],
      entrances: [
        {
          id: "entry",
          kind: "source",
          position: { x: 1, y: 5 },
          width: 0.1,
          arrivalRatePerMinute: 600,
          groupShare: 0,
        },
        {
          id: "exit",
          kind: "sink",
          position: { x: 9, y: 5 },
          width: 1,
          arrivalRatePerMinute: 0,
          groupShare: 0,
        },
      ],
      areas: [],
      targets: [],
      shops: [],
      servicePoints: [],
      countLines: [],
    });
    const engine = createSimulationEngineFromScene(scene, {
      fixedDtSeconds: 1,
      speedMetersPerSecond: 20,
    });

    engine.start();
    const snapshot = engine.step(1);
    const maxX = Math.max(...snapshot.agents.map((agent) => agent.x));

    expect(snapshot.spawnedCount).toBeGreaterThan(0);
    expect(snapshot.exitedCount).toBe(0);
    expect(maxX).toBeLessThan(5);
  });
});

describe("where arrivals go (ADR-0008)", () => {
  const corridor = (exitIds?: string[]) =>
    parseScene({
      schemaVersion: "1.0.0",
      id: "od-corridor",
      name: "OD corridor",
      seed: 9,
      world: { width: 60, height: 10 },
      entrances: [
        {
          id: "west-in",
          kind: "source",
          position: { x: 2, y: 5 },
          width: 3,
          arrivalRatePerMinute: 60,
          groupShare: 0,
          exitIds,
        },
        { id: "west-out", kind: "sink", position: { x: 4, y: 5 }, width: 2 },
        { id: "east-out", kind: "sink", position: { x: 58, y: 5 }, width: 2 },
      ],
    });

  it("sends arrivals to the exits their entrance allows, not the nearest", () => {
    const engine = createSimulationEngineFromScene(corridor(["east-out"]));
    engine.start();
    const snapshot = engine.step(60 * 20);

    expect(snapshot.agents.length).toBeGreaterThan(5);
    for (const agent of snapshot.agents) expect(agent.targetSinkId).toBe("east-out");
  });

  it("still leaves by the nearest exit when no exits are named", () => {
    const engine = createSimulationEngineFromScene(corridor());
    engine.start();
    const snapshot = engine.step(60 * 20);

    expect(snapshot.exitedCount).toBeGreaterThan(5);
  });

  it("lets evacuees take the nearest exit whatever their entrance allows", () => {
    const engine = createSimulationEngineFromScene(corridor(["east-out"]));
    engine.start();
    engine.step(60 * 5);
    engine.setEvacuation(true);
    // Long enough for pre-movement times to run out: nobody leaves on the
    // alarm's own tick any more.
    const snapshot = engine.step(60 * 20);

    // Alive, everyone was bound for east-out by their entrance. Whether the
    // nearest door then wins is tested in the decision backend, where the
    // exits can be laid out so the answer is unambiguous.
    expect(snapshot.exitedCount).toBeGreaterThan(0);
  });

  it("reports how long the building took to clear, and which doors did it", () => {
    const engine = createSimulationEngineFromScene(corridor());
    engine.start();
    engine.step(60 * 5);
    engine.setEvacuation(true);
    const snapshot = engine.step(60 * 90);

    // Someone left, so there is a clear time, measured from the alarm rather
    // than from the start of the run.
    expect(snapshot.evacuationClearSeconds ?? 0).toBeGreaterThan(0);
    expect(snapshot.evacuationClearSeconds ?? 0).toBeLessThan(90);

    const byExit = Object.values(snapshot.evacuationExits ?? {});
    expect(byExit.length).toBeGreaterThan(0);
    expect(byExit.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  });

  it("keeps no clear time when nobody has left since the alarm", () => {
    const engine = createSimulationEngineFromScene(corridor());
    engine.start();
    engine.setEvacuation(true);
    // Far short of anyone's pre-movement time.
    const snapshot = engine.step(12);

    expect(snapshot.evacuationClearSeconds ?? 0).toBe(0);
  });
});

describe("entrance capacity", () => {
  it("lets people in no faster than the entrance's width can pass them", () => {
    const engine = createSimulationEngine({
      seed: 3,
      sinks: [{ id: "exit", position: { x: 60, y: 10 }, radius: 1 }],
      sources: [
        { arrivalRatePerSecond: 100, id: "gate", position: { x: 2, y: 10 }, width: 1 },
      ],
      world: { height: 20, width: 80 },
    });

    engine.start();
    const snapshot = engine.step(60 * 10);

    // 1 m × Weidmann's peak specific flow for 10 s, plus the one person who
    // may always step through first.
    expect(snapshot.spawnedCount).toBeLessThanOrEqual(
      Math.floor(weidmannMaxSpecificFlow * 10) + 1,
    );
    expect(snapshot.spawnedCount).toBeGreaterThanOrEqual(
      Math.floor(weidmannMaxSpecificFlow * 10) - 1,
    );
    expect(weidmannMaxSpecificFlow).toBeGreaterThan(1.1);
    expect(weidmannMaxSpecificFlow).toBeLessThan(1.35);
  });
});

describe("scene speed persistence", () => {
  /**
   * One second of straight-line walking, measured on a scene capped to a single
   * agent: no neighbours means no jostling, so the displacement is the walking
   * speed itself. The shop sits 55 m from the gate, so the walker never arrives
   * inside the measured window.
   */
  function oneSecondWalkingDistance(
    engine: ReturnType<typeof createSimulationEngineFromScene>,
  ) {
    engine.start();
    // Walkers accelerate from rest over the relaxation time (0.5 s): measure
    // once they are up to speed.
    engine.step(240);
    const before = engine.snapshot().agents[0];
    const after = engine.step(60).agents[0];

    // Each walker's free speed is the scene speed times their own draw.
    return Math.hypot(after.x - before.x, after.y - before.y) / after.speedFactor!;
  }

  it("simulates editor scenes at Weidmann free-flow speed, not the legacy 8 m/s", () => {
    const engine = createSimulationEngineFromScene(mallScene({}), {
      maxAgents: 1,
    });

    expect(oneSecondWalkingDistance(engine)).toBeCloseTo(1.34, 2);
  });

  it("honours a scene-persisted speed instead of the default", () => {
    const engine = createSimulationEngineFromScene(
      mallScene({ speedMetersPerSecond: 0.5 }),
      { maxAgents: 1 },
    );

    expect(oneSecondWalkingDistance(engine)).toBeCloseTo(0.5, 2);
  });
});

describe("crowd coupling", () => {
  it("keeps a jammed crowd slower than the same scene flowing freely", () => {
    // Same geometry, same seed, same target: only the arrival rate differs, so
    // anything that changes the average speed is the crowd, not the route.
    const walkDistance = (arrivalRatePerMinute: number) => {
      const engine = createSimulationEngineFromScene(
        mallScene({
          entrances: [
            {
              id: "gate",
              kind: "source",
              position: { x: 5, y: 40 },
              width: 4,
              arrivalRatePerMinute,
              groupShare: 0,
            },
            ...mallExits,
          ],
        }),
      );
      engine.start();
      engine.step(60 * 20);
      const before = engine.snapshot();
      const after = engine.step(60);
      const walking = after.agents.filter((agent) => {
        const previous = before.agents.find((b) => b.id === agent.id);

        return previous !== undefined;
      });

      if (walking.length === 0) {
        return 0;
      }

      const total = walking.reduce((sum, agent) => {
        const previous = before.agents.find((b) => b.id === agent.id)!;

        return sum + Math.hypot(agent.x - previous.x, agent.y - previous.y);
      }, 0);

      return total / walking.length;
    };

    const sparse = walkDistance(30);
    const dense = walkDistance(3000);

    expect(sparse).toBeGreaterThan(0);
    expect(dense).toBeLessThan(sparse * 0.9);
    // Density coupling makes this spec genuinely heavy: ~2-3s alone and
    // several times that under a parallel full-suite run, so the 5s default
    // made it a coin flip rather than a signal. Same treatment as the
    // panel-dock data-source spec.
  }, 30_000);

  it("pushes overlapping walkers apart instead of letting them share a point", () => {
    const engine = createSimulationEngineFromScene(
      mallScene({
        entrances: [
          {
            id: "gate",
            kind: "source",
            // A flooded gate packs the same few squares, so without separation
            // agents would stack on the spawn line. Entrances pass at most
            // width × Weidmann's peak flow (~1.2 P/(m·s)), so the gate is 4 m
            // wide to let enough people in to crowd.
            position: { x: 5, y: 40 },
            width: 4,
            arrivalRatePerMinute: 6000,
            groupShare: 0,
          },
          ...mallExits,
        ],
      }),
      { maxAgents: 400 },
    );

    engine.start();
    const { agents } = engine.step(60 * 30);

    expect(agents.length).toBeGreaterThan(50);

    let closestPair = Number.POSITIVE_INFINITY;
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const distance = Math.hypot(
          agents[i].x - agents[j].x,
          agents[i].y - agents[j].y,
        );

        if (distance < closestPair) {
          closestPair = distance;
        }
      }
    }

    // Nobody should be standing inside anybody else.
    expect(closestPair).toBeGreaterThan(0.05);
    // Density coupling makes this spec genuinely heavy: ~2-3s alone and
    // several times that under a parallel full-suite run, so the 5s default
    // made it a coin flip rather than a signal. Same treatment as the
    // panel-dock data-source spec.
  }, 30_000);
});

function wall(id: string, x: number) {
  return {
    id,
    geometry: {
      type: "polyline" as const,
      points: [
        { x, y: 0 },
        { x, y: 80 },
      ],
    },
    thickness: 0.2,
  };
}

/** A source on the left, an exit next to it, and a shop to be reached. */
function mallScene(overrides: Partial<Parameters<typeof parseScene>[0]>) {
  return parseScene({
    schemaVersion: "1.0.0",
    id: "mall-flow",
    name: "Mall Flow",
    seed: 7,
    world: { width: 120, height: 80 },
    shops: [
      {
        id: "shop-a",
        name: "A",
        position: { x: 60, y: 40 },
        size: { width: 8, height: 8 },
        attraction: 1,
        capacity: 50,
        dwellMeanSeconds: 60,
      },
    ],
    entrances: [
      {
        id: "gate",
        kind: "source",
        position: { x: 5, y: 40 },
        width: 6,
        arrivalRatePerMinute: 300,
        groupShare: 0,
      },
      ...mallExits,
    ],
    ...overrides,
  });
}

const mallExits = [
  {
    id: "exit",
    kind: "sink" as const,
    position: { x: 5, y: 5 },
    width: 6,
    arrivalRatePerMinute: 0,
    groupShare: 0,
  },
];

function createTargetDecisionBackend() {
  let calls = 0;
  const backend: SimulationDecisionBackend & { calls: number } = {
    decisionHz: 10,
    id: "wasm-ready",
    get calls() {
      return calls;
    },
    decideAgents: ({ agents }) => {
      calls++;

      return agents.map((agent) => ({
        agentId: agent.id,
        nextState: "enterStore",
        selectedStoreId: "shop-a",
        target: { x: 3, y: 4 },
      }));
    },
  };

  return backend;
}
