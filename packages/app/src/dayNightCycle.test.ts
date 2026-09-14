import { describe, expect, it } from "vitest";
import {
  CITY_DAY_LENGTH_SECONDS,
  dayNightLighting,
  sunDirection,
} from "./dayNightCycle";

const HEX = /^#[0-9a-f]{6}$/i;

describe("dayNightLighting", () => {
  it("is brighter at midday than at midnight", () => {
    const midnight = dayNightLighting(0);
    const midday = dayNightLighting(CITY_DAY_LENGTH_SECONDS / 2);
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
    expect(dayNightLighting(17)).toEqual(
      dayNightLighting(17 + CITY_DAY_LENGTH_SECONDS),
    );
  });

  it("never emits negative intensities across the day", () => {
    for (let t = 0; t < CITY_DAY_LENGTH_SECONDS; t += 7) {
      const l = dayNightLighting(t);
      expect(l.keyIntensity).toBeGreaterThanOrEqual(0);
      expect(l.ambientIntensity).toBeGreaterThanOrEqual(0);
      expect(l.hemiIntensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("tints the sky differently at night than at midday", () => {
    const midnight = dayNightLighting(0);
    const midday = dayNightLighting(CITY_DAY_LENGTH_SECONDS / 2);
    expect(midnight.hemiSky).not.toBe(midday.hemiSky);
  });

  it("emits valid hex colours throughout the day", () => {
    for (let t = 0; t < CITY_DAY_LENGTH_SECONDS; t += 13) {
      const l = dayNightLighting(t);
      expect(l.keyColor).toMatch(HEX);
      expect(l.hemiSky).toMatch(HEX);
      expect(l.hemiGround).toMatch(HEX);
    }
  });
});

describe("sunLevel", () => {
  it("is dark at midnight and bright at midday", async () => {
    const { sunLevel } = await import("./dayNightCycle");
    expect(sunLevel(0)).toBeCloseTo(0, 6);
    expect(sunLevel(CITY_DAY_LENGTH_SECONDS / 2)).toBeCloseTo(1, 6);
  });
});

describe("sunDirection", () => {
  it("rises in the east, peaks in the south at noon and sets in the west", () => {
    const sunrise = sunDirection(CITY_DAY_LENGTH_SECONDS * 0.25);
    const noon = sunDirection(CITY_DAY_LENGTH_SECONDS * 0.5);
    const sunset = sunDirection(CITY_DAY_LENGTH_SECONDS * 0.75);

    expect(sunrise.x).toBeGreaterThan(0.5);
    expect(sunset.x).toBeLessThan(-0.5);
    expect(Math.abs(noon.x)).toBeLessThan(1e-9);
    expect(noon.y).toBeLessThan(0);
    expect(noon.z).toBeGreaterThan(sunrise.z);
  });

  it("is a unit vector that never sinks below the moonlight floor", () => {
    for (let t = 0; t < CITY_DAY_LENGTH_SECONDS; t += 3) {
      const d = sunDirection(t);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
      expect(d.z).toBeGreaterThan(0.2);
    }
  });
});
