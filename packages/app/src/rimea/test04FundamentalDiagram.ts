import { measureCorridorSpeed } from "../analytics/fundamentalDiagramHarness";
import {
  weidmannFundamentalDiagram,
  weidmannSpeedAtDensity,
} from "../analytics/pedestrianFundamentalDiagram";
import type { RimeaTestResult } from "./shared";

/**
 * The densities the guideline asks for, people per square metre
 * (A 2, test 4, p. 30): "0.5 P/m², 1 P/m², 2 P/m², 3 P/m², 4 P/m², 5 P/m² and
 * 6 P/m²".
 */
export const fundamentalDiagramDensities = [0.5, 1, 2, 3, 4, 5, 6] as const;

/**
 * How the measurement is taken (A 2, test 4, p. 30): the average speed over
 * **60 seconds**, with the **first 10 seconds** discarded as a transient.
 */
export const fundamentalDiagramMeasureSeconds = 60;
export const fundamentalDiagramTransientSeconds = 10;

/**
 * **A departure from the guideline's geometry, on purpose.**
 *
 * Test 4 specifies a corridor 1,000 m long and 10 m wide with a 2 x 2 m
 * measuring point at its centre. At the highest density it asks for, that is
 * 10,000 m² × 6 P/m² = **60,000 people** — which this engine cannot step in a
 * browser, and which the test does not need: the quantity measured is a local
 * speed at one point in a stream that has reached equilibrium.
 *
 * So the measurement is taken in a periodic corridor instead
 * (`fundamentalDiagramHarness`): a short length closed into a loop, filled to
 * the same density, with the people near each end mirrored at the other so
 * nobody sees empty space where the loop joins. That is the standard way this
 * curve is measured in the literature, and it is **not** what the guideline
 * says. Any report quoting this number must quote this paragraph with it.
 *
 * 20 m × 4 m is 80 m², so the densest case is 480 people rather than 60,000,
 * and the whole sweep is seconds rather than hours. The width is narrower than
 * the guideline's 10 m: still wide enough for several lanes and for
 * overtaking, which is what the measurement needs, and the narrowing is part
 * of the departure declared above.
 */
export const fundamentalDiagramCorridor = {
  lengthMeters: 20,
  widthMeters: 4,
} as const;

/**
 * How far the model may sit from Weidmann's curve, m/s.
 *
 * **Self-authored.** RiMEA asks that a model reproduce a fundamental diagram;
 * it does not publish this number. 0.10 m/s is taken from this project's own
 * calibration record, where the fit to Weidmann left 0.08 m/s of error and the
 * independent SFPE comparison 0.10 (`docs/calibration/`). It is a threshold
 * for a regression, not a standard.
 */
export const fundamentalDiagramToleranceMetersPerSecond = 0.1;

/**
 * Test 4: does the crowd slow down as it gets denser, the way the published
 * fundamental diagram says?
 *
 * The criterion's *form* is RiMEA's (reproduce the diagram); the curve is
 * Weidmann's as recorded in `pedestrianFundamentalDiagram.ts` with its source,
 * and the tolerance is this project's own (above). The measurement is a
 * periodic corridor filled to each density — `fundamentalDiagramHarness`.
 */
export function runFundamentalDiagramTest(
  options: {
    /**
     * Cut-down settings, for exercising this code path without the full
     * sweep. **A result produced with these is not the test**, and nothing
     * that reports one should use them: the guideline's own densities and
     * timing are the defaults, and the panel uses the defaults.
     */
    densities?: readonly number[];
    measureSeconds?: number;
  } = {},
): RimeaTestResult {
  const densities = options.densities ?? fundamentalDiagramDensities;
  const measureSeconds = options.measureSeconds ?? fundamentalDiagramMeasureSeconds;
  const deviations = densities.map((density) => {
    const measured = measureCorridorSpeed(
      density,
      {},
      {
        lengthMeters: fundamentalDiagramCorridor.lengthMeters,
        measureSeconds,
        seed: 4,
        warmupSeconds: fundamentalDiagramTransientSeconds,
        widthMeters: fundamentalDiagramCorridor.widthMeters,
      },
    );

    return {
      density,
      expected: weidmannSpeedAtDensity(density),
      measured,
    };
  });
  // Weidmann's curve reaches zero at its jam density, so above that it is not
  // a yardstick: every non-zero speed "deviates" from 0 and the worst error
  // would always land on the densest point. The guideline asks for the
  // measurement up to 6 P/m² and sets no threshold of its own, so those points
  // are measured and reported, and judged against nothing.
  const comparable = deviations.filter(
    (point) => point.density < weidmannFundamentalDiagram.jamDensityPerSquareMeter,
  );
  const beyondJam = deviations.filter(
    (point) => point.density >= weidmannFundamentalDiagram.jamDensityPerSquareMeter,
  );
  const worst = comparable.reduce((worstSoFar, point) =>
    Math.abs(point.measured - point.expected) >
    Math.abs(worstSoFar.measured - worstSoFar.expected)
      ? point
      : worstSoFar,
  );
  const worstError = Math.abs(worst.measured - worst.expected);
  const beyond = beyondJam
    .map((point) => `${point.density} P/m² ${point.measured.toFixed(2)} m/s`)
    .join(", ");

  return {
    number: 4,
    title: "Measurement of the fundamental diagram",
    status: worstError <= fundamentalDiagramToleranceMetersPerSecond ? "pass" : "fail",
    measured: `worst deviation ${worstError.toFixed(3)} m/s at ${worst.density} P/m² (model ${worst.measured.toFixed(2)}, Weidmann ${worst.expected.toFixed(2)})${beyond ? `; measured past Weidmann's jam density, not judged: ${beyond}` : ""}`,
    criterion: `RiMEA 4.1.1 A 2 test 4 (p. 29-30): densities ${densities.join(", ")} P/m², ${measureSeconds}s mean after a ${fundamentalDiagramTransientSeconds}s transient. Compared here against Weidmann (v0 ${weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond} m/s, jam ${weidmannFundamentalDiagram.jamDensityPerSquareMeter} P/m²) within ${fundamentalDiagramToleranceMetersPerSecond} m/s — the guideline sets no threshold, so that tolerance is self-authored, and the corridor is periodic rather than its 1,000 m one.`,
  };
}
