import { describe, expect, it } from "vitest";
import { agentAppearance } from "./agentAppearance";

const HEX = /^#[0-9a-f]{6}$/i;

describe("agentAppearance 3d", () => {
  const look = agentAppearance("3d");

  it("is large enough to be legible at city-scale camera distance", () => {
    // The 3d camera frames the whole 160x96 world (~96 units from origin), so a
    // realistic 0.7m-wide figure renders as a few pixels and disappears. The
    // crowd must read as people: keep human height but widen the footprint.
    expect(look.size.x).toBeGreaterThanOrEqual(1.0);
    expect(look.size.y).toBeGreaterThanOrEqual(1.0);
    expect(look.size.z).toBeGreaterThanOrEqual(1.8);
    expect(look.size.z).toBeLessThanOrEqual(2.5);
  });

  it("self-illuminates so figures stay visible in the dim scene", () => {
    expect(look.emissiveIntensity).toBeGreaterThan(0);
    expect(look.emissive).toMatch(HEX);
  });

  it("uses a valid base colour", () => {
    expect(look.color).toMatch(HEX);
  });
});

describe("agentAppearance 2d", () => {
  const look = agentAppearance("2d");

  it("returns a positive top-down footprint", () => {
    expect(look.size.x).toBeGreaterThan(0);
    expect(look.size.y).toBeGreaterThan(0);
  });

  it("uses a valid base colour", () => {
    expect(look.color).toMatch(HEX);
  });
});
