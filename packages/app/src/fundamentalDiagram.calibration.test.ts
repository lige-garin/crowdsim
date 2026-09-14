import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { socialForceParameters } from "./crowdMovement";
import {
  fitSocialForce,
  speedRmse,
  type FittedParameterName,
} from "./fundamentalDiagramFit";
import {
  sfpeCorridorSpeedAtDensity,
  weidmannSpeedAtDensity,
} from "./pedestrianFundamentalDiagram";

/**
 * The calibration run. Minutes of simulation, so it only runs when asked:
 *
 *   CALIBRATE=1 npx vitest run src/fundamentalDiagram.calibration.test.ts
 *
 * It fits on some densities and one seed in a 3 m corridor, then checks on
 * densities, seeds and a corridor width it never saw, and against a second
 * reference curve (SFPE) it was not fitted to. Results are written to
 * docs/calibration so the numbers in the code have a record behind them.
 */
const run = process.env.CALIBRATE ? it : it.skip;

const fitDensities = [0.5, 1.5, 2.5, 3.5];
const holdoutDensities = [1, 2, 3];
const current = (): Record<FittedParameterName, number> => ({
  agentRangeMeters: socialForceParameters.agentRangeMeters,
  agentStrength: socialForceParameters.agentStrength,
  anisotropy: socialForceParameters.anisotropy,
  relaxationSeconds: socialForceParameters.relaxationSeconds,
});
/** The hand-picked values before the 2026-09-14 fit, kept for the comparison. */
const handPicked = {
  agentRangeMeters: 0.3,
  agentStrength: 2.1,
  anisotropy: 0.3,
  relaxationSeconds: 0.5,
};

describe("social force calibration against the fundamental diagram", () => {
  run(
    "fits the corridor speed–density relation and checks it on unseen conditions",
    () => {
      const weidmann = { densities: fitDensities, speedAt: weidmannSpeedAtDensity };
      const log: string[] = [];
      // A new run writes a new dated file rather than overwriting the record.
      const stamp = new Date().toISOString().slice(0, 10);
      const fit = fitSocialForce(current(), weidmann, {
        maxEvaluations: Number(process.env.CALIBRATE_EVALUATIONS ?? 80),
        onEvaluation: (parameters, rmse) =>
          log.push(`${rmse.toFixed(4)} ${JSON.stringify(parameters)}`),
      });

      const holdout = { densities: holdoutDensities, speedAt: weidmannSpeedAtDensity };
      const unseen = { seeds: [2, 3], widthMeters: 5 };
      const sfpe = {
        densities: [1, 1.5, 2, 2.5, 3, 3.5],
        speedAt: sfpeCorridorSpeedAtDensity,
      };
      const sfpeRun = {
        meanFreeSpeedMetersPerSecond: 1.19,
        seeds: [4],
        widthMeters: 4,
      };
      const report = {
        date: stamp,
        fitted: fit.parameters,
        fitRmseOnFitDensities: fit.rmse,
        evaluations: fit.evaluations,
        // The hand-picked set is measured without the old density rule, which
        // no longer exists; the 2026-09-14 report records its with-rule error.
        holdoutRmse: {
          defaultsBeforeRun: speedRmse({}, holdout, unseen),
          handPicked: speedRmse(handPicked, holdout, unseen),
          fitted: speedRmse(fit.parameters, holdout, unseen),
        },
        sfpeRmse: {
          defaultsBeforeRun: speedRmse({}, sfpe, sfpeRun),
          handPicked: speedRmse(handPicked, sfpe, sfpeRun),
          fitted: speedRmse(fit.parameters, sfpe, sfpeRun),
        },
      };
      const file = resolve(
        process.cwd(),
        `../../docs/calibration/${stamp}-social-force-fundamental-diagram-run.json`,
      );
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...report, searchLog: log }, null, 2));

      expect(report.holdoutRmse.fitted).toBeLessThan(report.holdoutRmse.handPicked);
    },
    3_600_000,
  );
});
