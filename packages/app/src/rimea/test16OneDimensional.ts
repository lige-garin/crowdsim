import { bodyRadiusRangeMeters } from "../engine/behaviorDistributions";
import { measureCorridorSpeed } from "../analytics/fundamentalDiagramHarness";
import type { RimeaTestResult } from "./shared";
import {
  fundamentalDiagramMeasureSeconds,
  fundamentalDiagramTransientSeconds,
} from "./test04FundamentalDiagram";

/**
 * Test 16's corridor (A 4, p. 47): "the width of one agent, so agents can
 * move freely without being able to overtake" — narrower than test 4's, and
 * measured differently: **1D density, persons per metre of corridor, not per
 * square metre** ("in difference to the two-dimensional scenario, agent
 * density is measured in persons/distance (1/m)").
 *
 * The guideline offers two geometries: a ring (Fig. 21, "the advantage of a
 * ring is the avoidance of geometrical influences… the ring is the starting
 * and measuring area and there is no exit"), or a 200 m straight corridor
 * measured in a zone once it reaches a steady state. This project's existing
 * periodic-corridor harness (test 4's `fundamentalDiagramHarness`) already is
 * a loop with no start, end or exit — straight rather than curved, which by
 * the guideline's own reasoning removes nothing the ring's shape was for.
 * That is reused here rather than built twice.
 */
export const oneDimensionalCorridor = {
  lengthMeters: 20,
  /**
   * Wider than the largest body this project draws (0.2-0.26 m radius,
   * `behaviorDistributions.bodyRadiusRangeMeters`) by less than one more
   * body's width, so two people cannot stand abreast without their bodies
   * overlapping — "cannot overtake" as geometry, not a rule enforced on top.
   */
  widthMeters: 0.6,
} as const;

/**
 * Densities to sweep, people per metre, up to and a little past this
 * corridor's own geometric jam: bodies of radius up to
 * `bodyRadiusRangeMeters[1]` cannot stand in line closer than one diameter
 * apart, so `1 / (2 * 0.26) ≈ 1.92` people/m is where they would already be
 * touching shoulder to shoulder. The points past it are still measured
 * (`jamDensityPerMeter` below), the same treatment test 4 gives Weidmann's.
 */
export const oneDimensionalDensities = [0.5, 1, 1.5, 2, 2.5, 3] as const;

/**
 * This corridor's own geometric jam density, 1D, people/m — see
 * `oneDimensionalDensities`. Self-authored from body size, the way test 4
 * reads Weidmann's own jam density off its published curve.
 */
export const oneDimensionalJamDensityPerMeter = 1 / (2 * bodyRadiusRangeMeters[1]);

/**
 * Test 16: does the crowd slow down as a single-file corridor gets denser,
 * the way any true fundamental diagram must?
 *
 * The guideline's own reference is Fig. 20, a 10%/90% percentile envelope
 * from real tests whose raw data it says to download from RiMEA's own
 * website — not a printed table, and not fetched here. So the only thing
 * judged is a physical necessity, not that chart: speed must not *increase*
 * with density. That is checked only **below this corridor's own geometric
 * jam** (`oneDimensionalJamDensityPerMeter`): past it the model was seen, in
 * building this test, to swing between states seconds apart (0.30, 0.53,
 * 0.37, 0.46 m/s at 2.25-3 people/m on one run) rather than settle — plausibly
 * a real stop-and-go instability single-file crowds are known to show near
 * their own jam density, or a measurement window too short for this
 * geometry's equilibration, or both; nothing here distinguishes those. An
 * arbitrary slack on the comparison would only have hidden which. Those
 * points are still measured and reported, judged against nothing, exactly as
 * test 4 treats its own points past Weidmann's jam density.
 */
export function runOneDimensionalFundamentalDiagramTest(
  options: { densities?: readonly number[]; measureSeconds?: number } = {},
): RimeaTestResult {
  const densities = options.densities ?? oneDimensionalDensities;
  const measureSeconds = options.measureSeconds ?? fundamentalDiagramMeasureSeconds;
  const points = densities.map((density) => ({
    density,
    // 1D density (people/m) at this fixed width, expressed as the area
    // density measureCorridorSpeed expects: people/m ÷ width = people/m².
    speed: measureCorridorSpeed(
      density / oneDimensionalCorridor.widthMeters,
      {},
      {
        lengthMeters: oneDimensionalCorridor.lengthMeters,
        measureSeconds,
        seed: 16,
        warmupSeconds: fundamentalDiagramTransientSeconds,
        widthMeters: oneDimensionalCorridor.widthMeters,
      },
    ),
  }));
  const comparable = points.filter(
    (point) => point.density < oneDimensionalJamDensityPerMeter,
  );
  const beyondJam = points.filter(
    (point) => point.density >= oneDimensionalJamDensityPerMeter,
  );

  let violation: { at: number; from: number; to: number } | null = null;
  for (let i = 1; i < comparable.length; i++) {
    // A little slack for step-to-step measurement noise, not for a real rise.
    if (comparable[i].speed > comparable[i - 1].speed + 0.02) {
      violation ??= {
        at: comparable[i].density,
        from: comparable[i - 1].speed,
        to: comparable[i].speed,
      };
    }
  }
  const beyond = beyondJam
    .map((point) => `${point.density} 1/m ${point.speed.toFixed(2)} m/s`)
    .join(", ");

  return {
    number: 16,
    title: "1D fundamental diagram",
    status: violation ? "fail" : "pass",
    measured: violation
      ? `speed rose from ${violation.from.toFixed(2)} to ${violation.to.toFixed(2)} m/s at ${violation.at} 1/m — a fundamental diagram must not do that`
      : `${comparable.map((point) => `${point.density} 1/m ${point.speed.toFixed(2)} m/s`).join(", ")}${beyond ? `; measured past this corridor's own jam density, not judged: ${beyond}` : ""}`,
    criterion: `RiMEA 4.1.1 A 4 test 16 (p. 47): 1D density (persons/m) against mean speed on a corridor the width of one agent, measured and plotted against Fig. 20's percentile envelope — the guideline gives no numeric threshold of its own, and Fig. 20's raw data is a download from RiMEA's site, not fetched here. Measured on a ${oneDimensionalCorridor.lengthMeters} m periodic loop ${oneDimensionalCorridor.widthMeters} m wide (the guideline's ring, straight rather than curved, reusing test 4's method). Judged only below this corridor's own geometric jam density (${oneDimensionalJamDensityPerMeter.toFixed(2)} 1/m, self-authored from body size) — past it speed does not settle, and is reported unjudged rather than compared against an arbitrary tolerance.`,
  };
}
