import { mulberry32 } from "./simulationEngineRandom";

/**
 * A real Ensemble Kalman Filter (Evensen 1994; the stochastic/perturbed-
 * observation variant, Burgers, van Leeuwen & Evensen 1998) — not a
 * comparison report. `realObservations.ts` (gap-closure plan batch 4.2)
 * explicitly named this the prerequisite it was not attempting: "a plain
 * count-by-count comparison... not a filter that feeds corrections back
 * into the running simulation." This module is that filter; `assimilate*`
 * functions in `simulationEngine.ts` are what feeds its output back in.
 *
 * **The state being assimilated is a demand parameter (an entrance's
 * arrival rate), not the crowd itself.** A textbook EnKF for a full crowd
 * would need an ensemble of complete running simulations — hundreds of
 * agents' positions and states, per member, re-stepped every assimilation
 * window — which this project has no infrastructure to run and no budget
 * to justify: a single social-force step for ~1000 agents costs single-digit
 * milliseconds (`CLAUDE.md`'s 2026-09-19 measurement), so an ensemble of 30
 * running the same window in parallel would not be free. Assimilating the
 * low-dimensional cause (how many people are actually arriving) instead of
 * the high-dimensional effect (where all of them currently stand) is also
 * how published pedestrian-simulation data-assimilation work actually
 * approaches this (calibrating demand/OD parameters against sensor counts,
 * not filtering individual trajectories) — not a shortcut invented here to
 * avoid the hard case.
 *
 * The observation operator is the identity: a count line's measured flow
 * (people/minute) is read directly as an estimate of the entrance's true
 * arrival rate, with no model of the delay or attenuation between "how many
 * people entered" and "how many crossed a count line somewhere past that
 * entrance." A scene author who places the count line hard against the
 * entrance makes that identity closest to true; this is a disclosed
 * simplification, not a claim that the mapping is exact for every layout.
 */

export type EnkfEnsemble = {
  /** Each member's own estimate of the state (here: arrival rate, people/minute). */
  members: readonly number[];
};

/**
 * A fresh ensemble spread around `priorMean` — the scene's own authored
 * arrival rate, before any observation has corrected it. `spreadStd` is a
 * self-chosen prior uncertainty (not fitted, not read from data): how sure
 * a scene author's own number is assumed to be before real counts arrive.
 * Members are clamped at 0 — a negative arrival rate has no meaning.
 */
export function createEnkfEnsemble(
  priorMean: number,
  spreadStd: number,
  size: number,
  random: () => number,
): EnkfEnsemble {
  const members = Array.from({ length: size }, () =>
    Math.max(0, priorMean + gaussian(random) * spreadStd),
  );
  return { members };
}

/**
 * One assimilation step: correct `ensemble` toward `observation` (a real
 * measured rate, people/minute) using the standard stochastic EnKF update.
 * `observationNoiseStd` is the assumed measurement uncertainty (a turnstile
 * or camera count is not exact either) — self-chosen, the same class of
 * placeholder this project's other unfitted constants already are.
 *
 * Forecast covariance comes from the ensemble's own spread (no separate
 * process-noise model — the state is assumed to persist between windows
 * except for what the observation itself corrects, a standard "random walk"
 * EnKF state model for a slowly-varying parameter like a demand rate).
 * Each member is updated against its own independently perturbed copy of
 * the observation (Burgers et al. 1998) rather than the same one, which is
 * what keeps a stochastic EnKF's posterior spread from being an
 * underestimate — an EnKF against one shared observation would collapse
 * ensemble spread too fast, understating how much you still do not know
 * even after seeing one imprecise count.
 */
export function enkfUpdate(
  ensemble: EnkfEnsemble,
  observation: number,
  observationNoiseStd: number,
  random: () => number,
): EnkfEnsemble {
  const { members } = ensemble;
  const forecastMean = mean(members);
  const forecastVariance = variance(members, forecastMean);
  const observationVariance = observationNoiseStd * observationNoiseStd;
  const kalmanGain = forecastVariance / (forecastVariance + observationVariance);

  const updated = members.map((member) => {
    const perturbedObservation = observation + gaussian(random) * observationNoiseStd;
    return Math.max(0, member + kalmanGain * (perturbedObservation - member));
  });

  return { members: updated };
}

/** The ensemble's best current estimate: the mean across members. */
export function enkfMean(ensemble: EnkfEnsemble): number {
  return mean(ensemble.members);
}

/** How much the ensemble still disagrees with itself — the filter's own
 * uncertainty in its current estimate, for a caller that wants to report it
 * rather than just the point estimate. */
export function enkfSpread(ensemble: EnkfEnsemble): number {
  return Math.sqrt(variance(ensemble.members, mean(ensemble.members)));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: readonly number[], meanValue: number): number {
  if (values.length <= 1) return 0;
  const sumSquares = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0);
  return sumSquares / (values.length - 1);
}

/** Standard normal draw via Box-Muller, off the same `random()` stream every
 * other seeded draw in this project already uses (`mulberry32`). */
function gaussian(random: () => number): number {
  const u1 = Math.max(1e-12, random());
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** A deterministic random stream for an assimilation run, seeded the same
 * way every other reproducible stream in this engine is. */
export function createAssimilationRandom(seed: number): () => number {
  return mulberry32(seed);
}
