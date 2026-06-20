import { describe, expect, it } from "vitest";
import {
  agentWorldPosition,
  selectCrowdAgents,
  visibleAgentCount,
} from "./agentInstanceField";

const world = { width: 160, height: 96 };

describe("agentWorldPosition", () => {
  it("maps scene centre to world origin and stands on the ground in 3d", () => {
    expect(agentWorldPosition({ x: 80, y: 48 }, world, "3d")).toEqual({
      x: 0,
      y: 0,
      z: 0.9,
    });
  });

  it("maps scene origin to top-left (centred, Y-flipped)", () => {
    expect(agentWorldPosition({ x: 0, y: 0 }, world, "2d")).toEqual({
      x: -80,
      y: 48,
      z: 0,
    });
  });

  it("maps the far scene corner to bottom-right", () => {
    expect(agentWorldPosition({ x: 160, y: 96 }, world, "2d")).toEqual({
      x: 80,
      y: -48,
      z: 0,
    });
  });

  it("matches the scene-object transform convention (x - w/2, h/2 - y)", () => {
    const agent = { x: 100, y: 20 };
    expect(agentWorldPosition(agent, world, "2d")).toEqual({
      x: 100 - world.width / 2,
      y: world.height / 2 - 20,
      z: 0,
    });
  });
});

describe("selectCrowdAgents", () => {
  const snap = [{ id: 7, x: 1, y: 2 }];
  const overlay = [
    { id: 1, x: 3, y: 4 },
    { id: 2, x: 5, y: 6 },
  ];

  it("prefers the SharedArrayBuffer overlay when it has agents (worker path)", () => {
    expect(selectCrowdAgents(snap, overlay)).toBe(overlay);
  });

  it("falls back to snapshot agents when the overlay is empty or undefined", () => {
    expect(selectCrowdAgents(snap, [])).toBe(snap);
    expect(selectCrowdAgents(snap, undefined)).toBe(snap);
  });

  it("returns an empty list when both sources are empty", () => {
    expect(selectCrowdAgents(undefined, undefined)).toEqual([]);
  });

  it("keeps agent ids so a picked instance can be identified", () => {
    expect(selectCrowdAgents(snap, overlay)[0].id).toBe(1);
  });
});

describe("visibleAgentCount", () => {
  it("caps at the mesh capacity", () => {
    expect(visibleAgentCount(250_000, 100_000)).toBe(100_000);
  });

  it("floors fractional counts and clamps to >= 0", () => {
    expect(visibleAgentCount(12.9, 100_000)).toBe(12);
    expect(visibleAgentCount(-5, 100_000)).toBe(0);
    expect(visibleAgentCount(Number.NaN, 100_000)).toBe(0);
  });
});
