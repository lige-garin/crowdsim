import { describe, expect, it } from "vitest";
import { DAY_LENGTH_SECONDS, dayNightLighting } from "./dayNightCycle";

const HEX = /^#[0-9a-f]{6}$/i;

describe("dayNightLighting", () => {
  it("is brighter at midday than at midnight", () => {
    const midnight = dayNightLighting(0);
    const midday = dayNightLighting(DAY_LENGTH_SECONDS / 2);
    expect(midday.keyIntensity).toBeGreaterThan(midnight.keyIntensity);
    expect(midday.ambientIntensity).toBeGreaterThan(midnight.ambientIntensity);
    expect(midday.hemiIntensity).toBeGreaterThan(midnight.hemiIntensity);
  });

  it("keeps midnight a recognisably dark scene", () => {
    const midnight = dayNightLighting(0);
    expect(midnight.keyIntensity).toBeLessThan(0.4);
    expect(midnight.keyIntensity).toBeGreaterThanOrEqual(0);
  });

  it("repeats every day length (periodic clock)", () => {
    expect(dayNightLighting(17)).toEqual(dayNightLighting(17 + DAY_LENGTH_SECONDS));
  });

  it("never emits negative intensities across the day", () => {
    for (let t = 0; t < DAY_LENGTH_SECONDS; t += 7) {
      const l = dayNightLighting(t);
      expect(l.keyIntensity).toBeGreaterThanOrEqual(0);
      expect(l.ambientIntensity).toBeGreaterThanOrEqual(0);
      expect(l.hemiIntensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("tints the sky differently at night than at midday", () => {
    const midnight = dayNightLighting(0);
    const midday = dayNightLighting(DAY_LENGTH_SECONDS / 2);
    expect(midnight.hemiSky).not.toBe(midday.hemiSky);
  });

  it("emits valid hex colours throughout the day", () => {
    for (let t = 0; t < DAY_LENGTH_SECONDS; t += 13) {
      const l = dayNightLighting(t);
      expect(l.keyColor).toMatch(HEX);
      expect(l.hemiSky).toMatch(HEX);
      expect(l.hemiGround).toMatch(HEX);
    }
  });
});
