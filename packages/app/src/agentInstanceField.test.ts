import { describe, expect, it } from "vitest";
import { agentWorldPosition, visibleAgentCount } from "./agentInstanceField";

const world = { width: 160, height: 96 };

describe("agentWorldPosition", () => {
  it("maps scene centre to world origin", () => {
    expect(agentWorldPosition({ x: 80, y: 48 }, world, "3d")).toEqual({
      x: 0,
      y: 0,
      z: 0.23,
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
