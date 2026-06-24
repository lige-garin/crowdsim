import {
  buildGravityOdAllocation,
  type ODAllocationOptions,
  type ODDestination,
  type ODEntrance,
} from "./odEntryModel";

// Retail-first plan §4 P2 calibration gate: fit the gravity OD model's parameters
// to observed destination arrivals (e.g. counts a client provides), minimising
// squared error. Proves the fitting pipeline works by recovering the parameters
// that generated a synthetic target. Gradient-free: golden-section line search per
// parameter, coordinate descent across rounds (objective is ~unimodal near the
// optimum). Pure + deterministic.

export type OdArrivals = Record<string, number>;

export type OdFitOptions = {
  fitFloorPenalty?: boolean;
  rounds?: number;
};

export type OdFitResult = {
  distanceDecay: number;
  floorChangePenalty: number;
  error: number;
};

const DECAY_LO = 0;
const DECAY_HI = 0.5;
const PENALTY_LO = 0;
const PENALTY_HI = 100;

export function odArrivalError(
  entrances: readonly ODEntrance[],
  destinations: readonly ODDestination[],
  observed: OdArrivals,
  options: ODAllocationOptions,
): number {
  const allocation = buildGravityOdAllocation(entrances, destinations, options);
  let sse = 0;
  for (const destination of destinations) {
    const predicted = allocation.destinationArrivals[destination.id] ?? 0;
    const target = observed[destination.id] ?? 0;
    const diff = predicted - target;
    sse += diff * diff;
  }
  return sse;
}

// Grid-refine minimiser: a full grid each round (so it finds the global region,
// robust to the correlated decay/penalty "diagonal valley" that traps coordinate
// descent), then shrink the window around the best cell and repeat. Searches
// floorChangePenalty only when requested (otherwise it is fixed at 0).
export function fitOdGravityParameters(
  entrances: readonly ODEntrance[],
  destinations: readonly ODDestination[],
  observed: OdArrivals,
  options: OdFitOptions = {},
): OdFitResult {
  const searchPenalty = options.fitFloorPenalty ?? false;
  const rounds = options.rounds ?? 7;
  const steps = 24;

  let decayLo = DECAY_LO;
  let decayHi = DECAY_HI;
  let penaltyLo = PENALTY_LO;
  let penaltyHi = searchPenalty ? PENALTY_HI : 0;

  let best = { distanceDecay: 0, floorChangePenalty: 0, error: Number.POSITIVE_INFINITY };

  for (let round = 0; round < rounds; round++) {
    const penaltySteps = searchPenalty ? steps : 0;
    for (let i = 0; i <= steps; i++) {
      const distanceDecay = decayLo + ((decayHi - decayLo) * i) / steps;
      for (let j = 0; j <= penaltySteps; j++) {
        const floorChangePenalty =
          penaltySteps > 0 ? penaltyLo + ((penaltyHi - penaltyLo) * j) / penaltySteps : 0;
        const error = odArrivalError(entrances, destinations, observed, {
          distanceDecay,
          floorChangePenalty,
        });
        if (error < best.error) {
          best = { distanceDecay, floorChangePenalty, error };
        }
      }
    }

    const decayWindow = ((decayHi - decayLo) / steps) * 2;
    decayLo = Math.max(DECAY_LO, best.distanceDecay - decayWindow);
    decayHi = Math.min(DECAY_HI, best.distanceDecay + decayWindow);
    if (searchPenalty) {
      const penaltyWindow = ((penaltyHi - penaltyLo) / steps) * 2;
      penaltyLo = Math.max(PENALTY_LO, best.floorChangePenalty - penaltyWindow);
      penaltyHi = Math.min(PENALTY_HI, best.floorChangePenalty + penaltyWindow);
    }
  }

  return best;
}
