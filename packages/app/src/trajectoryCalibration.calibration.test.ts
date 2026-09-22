import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { socialForceParameters } from "./crowdMovement";
import { speedRmse } from "./fundamentalDiagramFit";
import { weidmannSpeedAtDensity } from "./pedestrianFundamentalDiagram";
import {
  buildCalibrationSamples,
  fitSocialForceToTrajectories,
  parseEthBiwiRows,
  trajectoryAccelerationRmse,
} from "./trajectoryCalibration";

/**
 * The trajectory calibration run — cheap compared to the fundamental-diagram
 * one (single-digit milliseconds per evaluation, since it scores real data
 * directly rather than running a simulated corridor), but still opt-in and
 * file-writing, so it follows the same gate `fundamentalDiagram.calibration.test.ts`
 * already established:
 *
 *   CALIBRATE=1 npx vitest run src/trajectoryCalibration.calibration.test.ts
 *
 * Writes a dated report to docs/calibration/ so the numbers in the code (if
 * ever adopted) have a record behind them, the same convention the 2026-09-14
 * report set.
 */
const run = process.env.CALIBRATE ? it : it.skip;

const fitDensities = [0.5, 1.5, 2.5, 3.5];
const current = () => ({
  agentRangeMeters: socialForceParameters.agentRangeMeters,
  agentStrength: socialForceParameters.agentStrength,
  anisotropy: socialForceParameters.anisotropy,
  relaxationSeconds: socialForceParameters.relaxationSeconds,
});
/** The values in place before the 2026-09-14 fundamental-diagram fit. */
const handPicked = {
  agentRangeMeters: 0.3,
  agentStrength: 2.1,
  anisotropy: 0.3,
  relaxationSeconds: 0.5,
};

describe("social force calibration against real ETH trajectory data", () => {
  run(
    "fits observed pedestrian accelerations and compares against the fundamental-diagram fit",
    () => {
      const raw = readFileSync(
        resolve(process.cwd(), "../../docs/calibration/data/eth-biwi-eth.txt"),
        "utf-8",
      );
      const samples = buildCalibrationSamples(parseEthBiwiRows(raw));
      const stamp = new Date().toISOString().slice(0, 10);
      const log: string[] = [];

      const fit = fitSocialForceToTrajectories(samples, current(), {
        maxEvaluations: Number(process.env.CALIBRATE_EVALUATIONS ?? 200),
        onEvaluation: (parameters, rmse) =>
          log.push(`${rmse.toFixed(4)} ${JSON.stringify(parameters)}`),
      });

      // Cross-check: how does each parameter set do under the *other*
      // calibration's own metric? This is the actual answer to "parameters
      // not unique" — not a claim that one method is right, but a direct
      // look at whether the two methods agree.
      const weidmann = { densities: fitDensities, speedAt: weidmannSpeedAtDensity };
      const fundamentalDiagramRmse = {
        hand_picked: speedRmse(handPicked, weidmann),
        fitted_on_fundamental_diagram: speedRmse(current(), weidmann),
        fitted_on_trajectories: speedRmse(fit.parameters, weidmann),
      };
      const trajectoryRmse = {
        hand_picked: trajectoryAccelerationRmse(samples, handPicked),
        fitted_on_fundamental_diagram: trajectoryAccelerationRmse(samples, current()),
        fitted_on_trajectories: trajectoryAccelerationRmse(samples, fit.parameters),
      };

      const report = {
        date: stamp,
        dataSource: "docs/calibration/data/eth-biwi-eth.txt (ETH pedestrian dataset)",
        sampleCount: samples.length,
        fittedOnTrajectories: fit.parameters,
        evaluations: fit.evaluations,
        trajectoryAccelerationRmseMetersPerSecondSquared: trajectoryRmse,
        fundamentalDiagramSpeedRmseMetersPerSecond: fundamentalDiagramRmse,
      };
      const file = resolve(
        process.cwd(),
        `../../docs/calibration/${stamp}-trajectory-calibration-run.json`,
      );
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...report, searchLog: log }, null, 2));

      expect(trajectoryRmse.fitted_on_trajectories).toBeLessThanOrEqual(
        trajectoryRmse.hand_picked,
      );
      expect(samples.length).toBeGreaterThan(1000);
    },
    120_000,
  );
});
