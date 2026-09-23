import { parseScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import {
  createSimulationEngineFromScene,
  type SimulationAgent,
} from "./simulationEngine";
import { mulberry32 } from "./simulationEngineRandom";
import {
  followLeaders,
  groupSpeedRatio,
  meanArrivalSize,
  sampleArrivalSize,
  walkingGroupParameters,
} from "./walkingGroups";

function agent(overrides: Partial<SimulationAgent>): SimulationAgent {
  return { id: 1, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, ...overrides };
}

function scene(entrance: Record<string, unknown>, shops = true) {
  return parseScene({
    schemaVersion: "1.0.0",
    id: "groups",
    name: "Groups",
    seed: 11,
    world: { width: 120, height: 40 },
    shops: shops
      ? [
          {
            id: "shop",
            name: "Shop",
            position: { x: 60, y: 20 },
            size: { width: 8, height: 8 },
            attraction: 1,
            capacity: 40,
            dwellMeanSeconds: 40,
          },
        ]
      : [],
    entrances: [
      {
        id: "gate",
        kind: "source",
        position: { x: 3, y: 20 },
        width: 6,
        arrivalRatePerMinute: 40,
        ...entrance,
      },
      {
        id: "exit",
        kind: "sink",
        position: { x: 117, y: 20 },
        width: 6,
        arrivalRatePerMinute: 0,
      },
    ],
  });
}

describe("walking groups (Moussaïd et al. 2010)", () => {
  it("draws arrivals so that 70% of people are in groups of mean size 2.22", () => {
    const random = mulberry32(3);
    let people = 0;
    let grouped = 0;
    let groups = 0;
    for (let draw = 0; draw < 40_000; draw++) {
      const size = sampleArrivalSize(random);
      people += size;
      if (size > 1) {
        grouped += size;
        groups++;
      }
    }
    expect(grouped / people).toBeCloseTo(0.7, 2);
    expect(grouped / groups).toBeCloseTo(2.22, 1);
    expect(people / 40_000).toBeCloseTo(meanArrivalSize(), 1);
  });

  it("uses no randomness when nobody comes in groups", () => {
    let calls = 0;
    const random = () => {
      calls++;
      return 0.5;
    };
    expect(sampleArrivalSize(random, 0)).toBe(1);
    expect(calls).toBe(0);
  });

  it("slows groups linearly with size, as observed", () => {
    expect(groupSpeedRatio(1)).toBe(1);
    expect(groupSpeedRatio(2)).toBeCloseTo(1.08 / 1.16, 6);
    expect(groupSpeedRatio(4)).toBeCloseTo(0.92 / 1.16, 6);
  });

  it("keeps people arriving together together, walking abreast at one pace", () => {
    const engine = createSimulationEngineFromScene(scene({ groupShare: 1 }, false));
    engine.start();
    engine.step(60 * 40);
    const agents = engine.snapshot().agents;
    const byGroup = new Map<number, typeof agents>();
    for (const agent of agents) {
      if (agent.groupId === undefined) continue;
      byGroup.set(agent.groupId, [...(byGroup.get(agent.groupId) ?? []), agent]);
    }
    expect(byGroup.size).toBeGreaterThan(3);

    const pairs = [...byGroup.values()].filter((members) => members.length === 2);
    expect(pairs.length).toBeGreaterThan(2);
    for (const [a, b] of pairs) {
      expect(a.speedFactor).toBe(b.speedFactor);
    }
    // Walking east: side by side means apart in y, level in x.
    const moving = pairs.filter(([a]) => a.x > 20 && a.x < 100);
    expect(moving.length).toBeGreaterThan(0);
    const along = moving.map(([a, b]) => Math.abs(a.x - b.x));
    const across = moving.map(([a, b]) => Math.abs(a.y - b.y));
    const mean = (values: number[]) =>
      values.reduce((total, value) => total + value, 0) / values.length;
    expect(mean(along)).toBeLessThan(0.35);
    expect(mean(across)).toBeGreaterThan(walkingGroupParameters.spacingMeters * 0.8);
    expect(mean(across)).toBeLessThan(1.2);
  });

  it("lets the leader choose: companions share the plan but never queue or pay", () => {
    const engine = createSimulationEngineFromScene(scene({ groupShare: 1 }));
    engine.start();
    let sawShared = false;
    for (let second = 0; second < 90; second++) {
      const agents = engine.step(60).agents;
      const leaders = new Map<number, (typeof agents)[number]>();
      for (const agent of agents) {
        if (agent.groupId === undefined) continue;
        const leader = leaders.get(agent.groupId);
        if (!leader || agent.id < leader.id) leaders.set(agent.groupId, agent);
      }
      for (const agent of agents) {
        const leader =
          agent.groupId === undefined ? undefined : leaders.get(agent.groupId);
        if (!leader || leader === agent) continue;
        expect(["queue", "checkout"]).not.toContain(agent.lifecycleState);
        expect(agent.servicePointId).toBeUndefined();
        if (leader.lifecycleState === "browse") {
          expect(agent.selectedStoreId).toBe(leader.selectedStoreId);
          sawShared = true;
        }
      }
    }
    expect(sawShared).toBe(true);
  });

  it("steps a waiting companion aside instead of freezing them in the middle of a corridor", () => {
    const leader = agent({
      id: 1,
      groupId: 1,
      lifecycleState: "queue",
      x: 10,
      y: 10,
    });
    // Standing well short of the leader, in the middle of the walkway they
    // both came down.
    const companion = agent({
      id: 2,
      groupId: 1,
      lifecycleState: "walk",
      x: 10,
      y: 4,
      targetX: 10,
      targetY: 10,
    });
    const leaders = new Map([[1, leader]]);

    const [, followed] = followLeaders([leader, companion], leaders);

    // Not frozen at their own current position (the old behaviour), and not
    // walking to the leader's exact spot either (that crowded the line).
    expect(followed.x).toBe(10);
    expect(followed.y).toBe(4);
    expect([followed.targetX, followed.targetY]).not.toEqual([
      companion.x,
      companion.y,
    ]);
    expect([followed.targetX, followed.targetY]).not.toEqual([leader.x, leader.y]);
    // The step is the configured distance from where the companion is standing.
    const stepped = Math.hypot(
      followed.targetX - companion.x,
      followed.targetY - companion.y,
    );
    expect(stepped).toBeCloseTo(walkingGroupParameters.waitStepAsideMeters, 5);
  });

  it("holds a waiting companion's step-aside point once they arrive, rather than recomputing it every tick", () => {
    const leader = agent({
      id: 1,
      groupId: 1,
      lifecycleState: "checkout",
      x: 10,
      y: 10,
    });
    // Already at a step-aside point from a previous tick (within the 1 m
    // "settled" radius of its own target).
    const companion = agent({
      id: 2,
      groupId: 1,
      lifecycleState: "walk",
      x: 10.5,
      y: 6,
      targetX: 10.5,
      targetY: 6,
    });
    const leaders = new Map([[1, leader]]);

    const [, followed] = followLeaders([leader, companion], leaders);

    expect(followed.targetX).toBe(10.5);
    expect(followed.targetY).toBe(6);
  });
});

describe("arrival profile", () => {
  it("follows the demand slots and stops when the profile ends", () => {
    const engine = createSimulationEngineFromScene(
      scene(
        {
          arrivalRatePerMinute: 999,
          arrivalProfile: { intervalMinutes: 1, ratesPerMinute: [30, 90] },
          groupShare: 0,
        },
        false,
      ),
    );
    engine.start();
    const firstMinute = engine.step(60 * 60).spawnedCount;
    const bothMinutes = engine.step(60 * 60).spawnedCount;
    const afterwards = engine.step(60 * 60).spawnedCount;

    expect(firstMinute).toBeGreaterThan(15);
    expect(firstMinute).toBeLessThan(45);
    expect(bothMinutes - firstMinute).toBeGreaterThan(65);
    expect(bothMinutes - firstMinute).toBeLessThan(115);
    // A few may still be let in from outside the gate in the first seconds.
    expect(afterwards - bothMinutes).toBeLessThan(3);
  });
});
