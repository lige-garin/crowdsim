import { describe, expect, it } from "vitest";
import {
  bodyRadiusRangeMeters,
  dwellCoefficientOfVariation,
  freeSpeedRelativeSigma,
  hashUnit,
  sampleBodyRadius,
  sampleDwellSeconds,
  sampleServiceSeconds,
  sampleSpeedFactor,
} from "./behaviorDistributions";

function stats(values: readonly number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { cv: Math.sqrt(variance) / mean, mean, sd: Math.sqrt(variance) };
}

const ids = Array.from({ length: 20_000 }, (_, index) => index + 1);

describe("behaviour distributions", () => {
  it("hashes to a stable, uniform-looking unit value", () => {
    expect(hashUnit(7, 12, "shop")).toBe(hashUnit(7, 12, "shop"));
    expect(hashUnit(7, 12, "shop")).not.toBe(hashUnit(7, 13, "shop"));
    const values = ids.map((id) => hashUnit(3, id));
    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(stats(values).mean).toBeCloseTo(0.5, 2);
  });

  it("draws dwell times with the requested mean and a right skew", () => {
    const values = ids.map((id) => sampleDwellSeconds(120, 5, id, "cafe"));
    const { cv, mean } = stats(values);
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    expect(mean).toBeGreaterThan(120 * 0.97);
    expect(mean).toBeLessThan(120 * 1.03);
    expect(cv).toBeGreaterThan(dwellCoefficientOfVariation * 0.9);
    expect(cv).toBeLessThan(dwellCoefficientOfVariation * 1.1);
    expect(median).toBeLessThan(mean);
  });

  it("gives the same shopper a different dwell in a different shop", () => {
    expect(sampleDwellSeconds(120, 5, 9, "cafe")).not.toBe(
      sampleDwellSeconds(120, 5, 9, "books"),
    );
  });

  it("draws Erlang-2 service times with the requested mean", () => {
    const { cv, mean } = stats(
      ids.map((id) => sampleServiceSeconds(30, 2, id, "till")),
    );

    expect(mean).toBeGreaterThan(30 * 0.97);
    expect(mean).toBeLessThan(30 * 1.03);
    expect(cv).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it("spreads free walking speed like Weidmann's 1.34 ± 0.26 m/s", () => {
    const speeds = ids.map((id) => 1.34 * sampleSpeedFactor(11, id));
    const { mean, sd } = stats(speeds);

    expect(mean).toBeCloseTo(1.34, 2);
    expect(sd).toBeGreaterThan(0.24);
    expect(sd).toBeLessThan(0.27);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(
      1.34 * (1 - 2.5 * freeSpeedRelativeSigma) - 1e-9,
    );
  });

  it("keeps body radius in the shoulder-width band", () => {
    const radii = ids.map((id) => sampleBodyRadius(4, id));

    expect(Math.min(...radii)).toBeGreaterThanOrEqual(bodyRadiusRangeMeters[0]);
    expect(Math.max(...radii)).toBeLessThanOrEqual(bodyRadiusRangeMeters[1]);
  });
});
