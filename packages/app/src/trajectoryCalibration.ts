import { boundedNelderMead } from "./boundedNelderMead";
import { socialForceParameters } from "./crowdMovement";
import { fitBounds, type FittedParameterName } from "./fundamentalDiagramFit";

/**
 * Calibrating `crowdMovement.ts`'s social-force parameters directly against
 * observed pedestrian trajectories, rather than against a published
 * speed-density curve — the gap the existing fundamental-diagram
 * calibration's own report names explicitly: "A published curve, not
 * trajectories. No measured pedestrian trajectories were used."
 * (`docs/calibration/2026-09-14-social-force-fundamental-diagram.md`).
 *
 * Method: one-step acceleration matching, not a full simulated rollout.
 * For each moment a real pedestrian was observed (with a real velocity
 * just before and just after), the social-force formula predicts an
 * acceleration from their *actual* position, velocity and the *actual*
 * positions of their real neighbours at that same frame — never from a
 * simulated trajectory that could drift from the data. The fitted
 * parameters are the same four `fundamentalDiagramFit.ts` already fits
 * (`fitBounds`, `boundedNelderMead` — the same solver, not a second copy),
 * so the two calibrations are directly comparable.
 *
 * Data: `docs/calibration/data/eth-biwi-eth.txt` (see that directory's own
 * README for provenance, format and licence disclosure) — one scene, not
 * the full ETH/UCY corpus.
 *
 * Deliberately excluded from the predicted-acceleration formula, disclosed
 * rather than silently approximated:
 * - **Walls.** The ETH scene is open space; this project has no wall
 *   geometry for it.
 * - **Anticipation and sidestep.** Both are real forces in
 *   `crowdMovement.ts`, but neither is one of the four parameters the
 *   fundamental-diagram calibration fits either — excluding them here
 *   keeps the two calibrations comparable on the same subset, rather than
 *   fitting a bigger model here than there.
 * - **Body radius.** The ETH data has no body-size measurements;
 *   `bodyRadiusMeters` is a single representative value (this project's own
 *   default sampling range is 0.20-0.26 m), not per-person.
 * - **Desired velocity.** Real pedestrians have no labelled "goal" in this
 *   data. Each person's own net displacement over their *whole* observed
 *   track, divided by its duration, stands in for it — the standard
 *   simplification this kind of calibration uses (assumes each person
 *   walked roughly toward their eventual endpoint the whole time), not a
 *   measurement.
 */

const secondsPerFrameUnit = 0.04; // see docs/calibration/data/README.md
const bodyRadiusMeters = 0.23; // this project's own default sampling range is 0.20-0.26 m
const interactionRangeMeters = socialForceParameters.interactionRangeMeters; // not fitted here
const contactStiffness = socialForceParameters.contactStiffness; // not fitted here

type Vector2 = { x: number; y: number };

export type EthRow = { frame: number; pedestrianId: string; x: number; y: number };

/** Parses the whitespace-separated `frame pedestrian_id x y` rows this dataset uses. */
export function parseEthBiwiRows(raw: string): EthRow[] {
  const rows: EthRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;
    const frame = Number(parts[0]);
    const x = Number(parts[2]);
    const y = Number(parts[3]);
    if (!Number.isFinite(frame) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    rows.push({ frame, pedestrianId: parts[1], x, y });
  }
  return rows;
}

export type CalibrationSample = {
  desiredVelocity: Vector2;
  neighbors: readonly { position: Vector2 }[];
  observedAcceleration: Vector2;
  position: Vector2;
  velocity: Vector2;
};

/**
 * Every usable (pedestrian, frame) moment: has a real velocity both just
 * before and just after (so an observed acceleration exists), paired with
 * the real neighbours present at that exact frame and the track's own
 * whole-trajectory desired velocity.
 */
export function buildCalibrationSamples(rows: readonly EthRow[]): CalibrationSample[] {
  const byPedestrian = new Map<string, EthRow[]>();
  const byFrame = new Map<number, EthRow[]>();

  for (const row of rows) {
    const track = byPedestrian.get(row.pedestrianId) ?? [];
    track.push(row);
    byPedestrian.set(row.pedestrianId, track);

    const frameRows = byFrame.get(row.frame) ?? [];
    frameRows.push(row);
    byFrame.set(row.frame, frameRows);
  }

  const samples: CalibrationSample[] = [];

  for (const [pedestrianId, unsorted] of byPedestrian) {
    const track = [...unsorted].sort((a, b) => a.frame - b.frame);
    if (track.length < 3) continue;

    const first = track[0];
    const last = track[track.length - 1];
    const totalSeconds = (last.frame - first.frame) * secondsPerFrameUnit;
    const desiredVelocity: Vector2 =
      totalSeconds > 0
        ? { x: (last.x - first.x) / totalSeconds, y: (last.y - first.y) / totalSeconds }
        : { x: 0, y: 0 };

    for (let i = 1; i < track.length - 1; i++) {
      const previous = track[i - 1];
      const current = track[i];
      const next = track[i + 1];
      const dtPrev = (current.frame - previous.frame) * secondsPerFrameUnit;
      const dtNext = (next.frame - current.frame) * secondsPerFrameUnit;
      if (dtPrev <= 0 || dtNext <= 0) continue;

      const velocity: Vector2 = {
        x: (current.x - previous.x) / dtPrev,
        y: (current.y - previous.y) / dtPrev,
      };
      const velocityNext: Vector2 = {
        x: (next.x - current.x) / dtNext,
        y: (next.y - current.y) / dtNext,
      };
      const dtCentral = (dtPrev + dtNext) / 2;
      const observedAcceleration: Vector2 = {
        x: (velocityNext.x - velocity.x) / dtCentral,
        y: (velocityNext.y - velocity.y) / dtCentral,
      };

      const neighbors = (byFrame.get(current.frame) ?? [])
        .filter((row) => row.pedestrianId !== pedestrianId)
        .map((row) => ({ position: { x: row.x, y: row.y } }));

      samples.push({
        desiredVelocity,
        neighbors,
        observedAcceleration,
        position: { x: current.x, y: current.y },
        velocity,
      });
    }
  }

  return samples;
}

/** The social-force formula's predicted acceleration for one sample — see this
 * module's own doc comment for exactly what is and is not replicated. */
export function predictedAcceleration(
  sample: Pick<
    CalibrationSample,
    "desiredVelocity" | "neighbors" | "position" | "velocity"
  >,
  parameters: Record<FittedParameterName, number>,
): Vector2 {
  const speed = Math.hypot(sample.velocity.x, sample.velocity.y);
  const heading: Vector2 =
    speed > 1e-6
      ? { x: sample.velocity.x / speed, y: sample.velocity.y / speed }
      : { x: 0, y: 0 };

  let ax =
    (sample.desiredVelocity.x - sample.velocity.x) / parameters.relaxationSeconds;
  let ay =
    (sample.desiredVelocity.y - sample.velocity.y) / parameters.relaxationSeconds;

  const bodies = bodyRadiusMeters * 2;

  for (const other of sample.neighbors) {
    let ox = sample.position.x - other.position.x;
    let oy = sample.position.y - other.position.y;
    const gap = Math.hypot(ox, oy);
    if (gap >= interactionRangeMeters || gap < 1e-6) continue;
    ox /= gap;
    oy /= gap;

    const facing = -(heading.x * ox + heading.y * oy);
    const weight =
      parameters.anisotropy + (1 - parameters.anisotropy) * ((1 + facing) / 2);
    let push =
      parameters.agentStrength *
      Math.exp((bodies - gap) / parameters.agentRangeMeters) *
      weight;
    if (gap < bodies) push += contactStiffness * (bodies - gap);

    ax += push * ox;
    ay += push * oy;
  }

  return { x: ax, y: ay };
}

/** Root-mean-square acceleration error over every sample, m/s². */
export function trajectoryAccelerationRmse(
  samples: readonly CalibrationSample[],
  parameters: Record<FittedParameterName, number>,
): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (const sample of samples) {
    const predicted = predictedAcceleration(sample, parameters);
    sumSq +=
      (predicted.x - sample.observedAcceleration.x) ** 2 +
      (predicted.y - sample.observedAcceleration.y) ** 2;
  }
  return Math.sqrt(sumSq / samples.length);
}

const names = Object.keys(fitBounds) as FittedParameterName[];

/** Fits the same four social-force parameters against real trajectory data,
 * using the same bounded Nelder-Mead solver the fundamental-diagram fit uses. */
export function fitSocialForceToTrajectories(
  samples: readonly CalibrationSample[],
  start: Record<FittedParameterName, number>,
  options: {
    maxEvaluations?: number;
    onEvaluation?: (
      parameters: Record<FittedParameterName, number>,
      rmse: number,
    ) => void;
  } = {},
): {
  evaluations: number;
  parameters: Record<FittedParameterName, number>;
  rmse: number;
} {
  const result = boundedNelderMead(
    names,
    fitBounds,
    start,
    (parameters) => trajectoryAccelerationRmse(samples, parameters),
    options,
  );
  return {
    evaluations: result.evaluations,
    parameters: result.parameters,
    rmse: result.value,
  };
}
