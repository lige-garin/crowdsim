/**
 * Per-person variation for the behaviour and movement models.
 *
 * Every draw here is a pure function of (seed, agent id, what is being drawn),
 * not of the simulation's random stream. So a shopper's dwell time does not
 * depend on how many other shoppers happened to be decided first in the same
 * tick, the same person gets the same body and pace after a hot scene update,
 * and adding a draw never shifts the arrival or shop-choice sequence.
 */

/**
 * Uniform in (0, 1) from a hash of the keys. FNV-1a over the key parts, then a
 * murmur-style finaliser so neighbouring ids do not give neighbouring values.
 */
export function hashUnit(...keys: readonly (number | string)[]): number {
  let hash = 0x811c9dc5;
  for (const key of keys) {
    const text = typeof key === "number" ? `${key}|` : `${key}\u0000`;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  // Offset by half a step so the result is never exactly 0 (log-safe) or 1.
  return ((hash >>> 0) + 0.5) / 4_294_967_296;
}

/** A standard normal draw from two hashed uniforms (Box–Muller). */
export function hashStandardNormal(...keys: readonly (number | string)[]): number {
  const u1 = hashUnit(...keys, "n1");
  const u2 = hashUnit(...keys, "n2");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Coefficient of variation of browse dwell time. Self-chosen, not calibrated:
 * dwell in a shop is right-skewed (most people stay briefly, a few stay long),
 * which a lognormal captures; 0.6 is a moderate spread. Replace with a fitted
 * value once there is observed dwell data.
 */
export const dwellCoefficientOfVariation = 0.6;

/**
 * Service phases for checkout time. An Erlang-2 (CV ≈ 0.71) is the textbook
 * middle ground between a fixed service time (CV 0, which makes queue lengths
 * unrealistically regular) and an exponential one (CV 1). Self-chosen.
 */
export const servicePhases = 2;

/** Lognormal draw with the given mean and coefficient of variation. */
export function lognormalFromMean(mean: number, cv: number, standardNormal: number) {
  if (mean <= 0) return 0;
  const sigmaSq = Math.log(1 + cv * cv);
  const mu = Math.log(mean) - sigmaSq / 2;
  return Math.exp(mu + Math.sqrt(sigmaSq) * standardNormal);
}

/** How long this shopper browses this shop, averaging `meanSeconds` over shoppers. */
export function sampleDwellSeconds(
  meanSeconds: number,
  seed: number,
  agentId: number,
  shopId: string,
) {
  return lognormalFromMean(
    meanSeconds,
    dwellCoefficientOfVariation,
    hashStandardNormal(seed, agentId, shopId, "dwell"),
  );
}

/**
 * Mean pre-movement time: how long, on average, a person takes to start
 * moving after the alarm — noticing it, deciding it is real, gathering
 * things, telling others.
 *
 * SELF-CHOSEN AND NOT CALIBRATED. This project has no observed evacuation to
 * fit to, and none of its round numbers should be read as a prediction of any
 * building's evacuation. The point of the distribution is narrower and
 * honest: real people do not all begin on the same instant, and before this
 * the model started every one of them on the same decision tick.
 */
export const evacuationReactionMeanSeconds = 16;

/**
 * Pre-movement times are strongly right-skewed — most people move within a
 * few seconds, a few take several times the mean — which is why evacuation
 * models use a lognormal for them. 0.75 is a self-chosen spread (see above);
 * the mean alone would put everyone on the same tick again.
 */
export const evacuationReactionCoefficientOfVariation = 0.75;

/** How long this person waits after the alarm before starting to move. */
export function sampleEvacuationReactionSeconds(seed: number, agentId: number) {
  return lognormalFromMean(
    evacuationReactionMeanSeconds,
    evacuationReactionCoefficientOfVariation,
    hashStandardNormal(seed, agentId, "evacuation-reaction"),
  );
}

/**
 * A premovement time uniform on `[minSeconds, maxSeconds]`, for a scenario
 * that specifies one directly rather than this project's own lognormal —
 * RiMEA test 5 (A 2, p. 30) is the only caller: "uniformly distributed
 * between 10 s and 100 s", not a shape this project chose or calibrated.
 */
export function sampleUniformReactionSeconds(
  seed: number,
  agentId: number,
  minSeconds: number,
  maxSeconds: number,
) {
  return (
    minSeconds + hashUnit(seed, agentId, "uniform-reaction") * (maxSeconds - minSeconds)
  );
}

/** How long this shopper's checkout takes, averaging `meanSeconds` (Erlang). */
export function sampleServiceSeconds(
  meanSeconds: number,
  seed: number,
  agentId: number,
  counterId: string,
) {
  if (meanSeconds <= 0) return 0;
  let total = 0;
  for (let phase = 0; phase < servicePhases; phase++) {
    total -= Math.log(hashUnit(seed, agentId, counterId, "service", phase));
  }
  return (total * meanSeconds) / servicePhases;
}

/**
 * Free walking speed, relative to the scene's mean speed. Weidmann (1993)
 * reports free-flow speed as 1.34 m/s with σ = 0.26 m/s
 * (`pedestrianFundamentalDiagram`), so the relative spread is 0.26 / 1.34.
 * Truncated at ±2.5σ: nobody strolls at 0.7 m/s or sprints at 2 m/s.
 */
export const freeSpeedRelativeSigma = 0.26 / 1.34;
const speedTruncationSigmas = 2.5;

export function sampleSpeedFactor(seed: number, agentId: number) {
  const z = hashStandardNormal(seed, agentId, "speed");
  const clamped = Math.max(-speedTruncationSigmas, Math.min(speedTruncationSigmas, z));
  return 1 + clamped * freeSpeedRelativeSigma;
}

/**
 * Body radius in metres. Adult shoulder breadth is roughly 0.4–0.5 m, so a
 * circle of radius 0.2–0.26 m; drawn uniformly in that band. This is the size
 * people keep apart by, not the drawn figure.
 */
export const bodyRadiusRangeMeters = [0.2, 0.26] as const;

export function sampleBodyRadius(seed: number, agentId: number) {
  const [low, high] = bodyRadiusRangeMeters;
  return low + (high - low) * hashUnit(seed, agentId, "radius");
}
