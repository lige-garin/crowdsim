import { describe, expect, it } from "vitest";
import { weidmannFundamentalDiagram } from "../pedestrianFundamentalDiagram";
import {
  DEFAULT_SKELETAL_CHARACTER_CAPACITY,
  SKELETAL_MOVEMENT_THRESHOLD_METERS_PER_SECOND,
  selectNearestSkeletalAgents,
  skeletalGaitTimeScale,
  type SkeletalCharacterAgent,
} from "./skeletalCharacters";

const world = { height: 100, width: 100 };

describe("skeletalGaitTimeScale", () => {
  it("plays at 1x for the Weidmann nominal walking speed", () => {
    expect(
      skeletalGaitTimeScale(weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond),
    ).toBeCloseTo(1, 5);
  });

  it("plays faster for a faster walker and slower for a slower one", () => {
    const slow = skeletalGaitTimeScale(0.5);
    const nominal = skeletalGaitTimeScale(
      weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond,
    );
    const fast = skeletalGaitTimeScale(2.5);
    expect(slow).toBeLessThan(nominal);
    expect(fast).toBeGreaterThan(nominal);
  });

  it("never drops to zero or freezes mid-stride for a near-stopped agent", () => {
    expect(skeletalGaitTimeScale(0)).toBeGreaterThan(0);
  });

  it("caps an unrealistically fast agent instead of flailing without bound", () => {
    const capped = skeletalGaitTimeScale(1000);
    expect(skeletalGaitTimeScale(20)).toBe(capped);
  });
});

describe("selectNearestSkeletalAgents", () => {
  const camera = { x: 0, y: 0, z: 10 };

  function agent(id: number, x: number, y: number): SkeletalCharacterAgent {
    return { id, x, y };
  }

  it("picks the closest agents to the camera, nearest first", () => {
    // Render-space distance from the camera at (0,0): scene (50,50) is the
    // render origin for this 100x100 world, so agent placement below is
    // chosen directly in render-space terms via world offsets.
    const agents = [
      agent(1, 50 + 30, 50), // 30 m along render +x
      agent(2, 50 + 5, 50), // 5 m along render +x
      agent(3, 50 + 15, 50), // 15 m along render +x
    ];
    const chosen = selectNearestSkeletalAgents(agents, world, camera, 2, 100);
    expect(chosen.map((c) => c.agent.id)).toEqual([2, 3]);
  });

  it("excludes agents beyond the distance cap even with room in capacity", () => {
    const agents = [agent(1, 50 + 5, 50), agent(2, 50 + 500, 50)];
    const chosen = selectNearestSkeletalAgents(agents, world, camera, 10, 20);
    expect(chosen.map((c) => c.agent.id)).toEqual([1]);
  });

  it("returns render-space coordinates matching agentWorldPosition's convention", () => {
    // Scene (60, 40) in a 100x100 world -> render (10, 10): render x is
    // scene x minus half-width, render y is half-height minus scene y.
    const chosen = selectNearestSkeletalAgents(
      [agent(1, 60, 40)],
      world,
      camera,
      1,
      1000,
    );
    expect(chosen[0].renderX).toBeCloseTo(10, 6);
    expect(chosen[0].renderY).toBeCloseTo(10, 6);
  });

  it("returns nothing when nobody is in range", () => {
    const chosen = selectNearestSkeletalAgents(
      [agent(1, 50 + 500, 50)],
      world,
      camera,
      5,
      20,
    );
    expect(chosen).toEqual([]);
  });

  it("caps at the given capacity even with more agents in range", () => {
    const agents = Array.from({ length: 20 }, (_, i) => agent(i + 1, 50 + i, 50));
    const chosen = selectNearestSkeletalAgents(agents, world, camera, 5, 1000);
    expect(chosen).toHaveLength(5);
  });
});

describe("constants", () => {
  it("shares the same moving threshold crowdFigures.ts uses (0.12 m/s)", () => {
    // Not derived from crowdFigures.ts's own constant (it's a private, not
    // exported), so this pins the two numbers to the same literal so a
    // future change to one is at least visible as a diff here too.
    expect(SKELETAL_MOVEMENT_THRESHOLD_METERS_PER_SECOND).toBe(0.12);
  });

  it("keeps the pool small — this is a close-up layer, not a crowd-wide one", () => {
    expect(DEFAULT_SKELETAL_CHARACTER_CAPACITY).toBeLessThan(50);
  });
});
