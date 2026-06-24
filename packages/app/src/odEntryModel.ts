import type { ScenePoint } from "@crowdsim/scene-schema";

// Retail behaviour layer (retail-first plan §2/§4 P2): a gravity / origin-
// destination entry model. Distributes each entrance's inflow across destinations
// (zones / store lots) by attraction with distance decay and a cross-floor cost,
// producing an OD matrix that seeds destination assignment and feeds OD analytics.
//
// Model (entropy-maximising / Wilson gravity): for entrance e and destination d,
//   weight(e, d) = max(0, attraction(d)) * exp(-distanceDecay * effDist(e, d))
//   effDist(e, d) = euclidean(e, d) + floorChangePenalty * |floor(d) - floor(e)|
// probability(e -> d) = weight / sum_d weight; expectedFlow = inflow * probability.
// distanceDecay = 0 reduces to attraction-share (matches the attraction-only
// store choice in mallCrowdDecisionBackend). Exponential decay avoids the
// singularity of a power-law 1/d^beta at d -> 0. Pure + deterministic.

export type ODEntrance = {
  id: string;
  position: ScenePoint;
  inflow: number;
  floor?: number;
};

export type ODDestination = {
  id: string;
  position: ScenePoint;
  attraction: number;
  floor?: number;
};

export type ODAllocationOptions = {
  /** Gravity distance-decay coefficient (per scene unit). 0 => attraction only. */
  distanceDecay?: number;
  /** Effective-distance penalty added per floor of separation. */
  floorChangePenalty?: number;
};

export type ODAllocationRow = {
  destinationId: string;
  probability: number;
  expectedFlow: number;
};

export type ODAllocation = {
  byEntrance: Record<string, ODAllocationRow[]>;
  destinationArrivals: Record<string, number>;
  totalInflow: number;
};

export function buildGravityOdAllocation(
  entrances: readonly ODEntrance[],
  destinations: readonly ODDestination[],
  options: ODAllocationOptions = {},
): ODAllocation {
  const distanceDecay = options.distanceDecay ?? 0.08;
  const floorChangePenalty = options.floorChangePenalty ?? 0;

  const byEntrance: Record<string, ODAllocationRow[]> = {};
  const destinationArrivals: Record<string, number> = {};
  for (const destination of destinations) {
    destinationArrivals[destination.id] = 0;
  }
  let totalInflow = 0;

  for (const entrance of entrances) {
    totalInflow += entrance.inflow;

    const weights = destinations.map((destination) => {
      const dx = destination.position.x - entrance.position.x;
      const dy = destination.position.y - entrance.position.y;
      const floorDelta = Math.abs((destination.floor ?? 0) - (entrance.floor ?? 0));
      const effectiveDistance =
        Math.hypot(dx, dy) + floorChangePenalty * floorDelta;
      return Math.max(0, destination.attraction) * Math.exp(-distanceDecay * effectiveDistance);
    });

    let weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    let usedWeights = weights;
    if (weightSum <= 0) {
      // No attraction anywhere -> split evenly so flow is still conserved.
      usedWeights = destinations.map(() => 1);
      weightSum = destinations.length;
    }

    const rows: ODAllocationRow[] = destinations.map((destination, index) => {
      const probability = weightSum > 0 ? usedWeights[index] / weightSum : 0;
      const expectedFlow = entrance.inflow * probability;
      destinationArrivals[destination.id] += expectedFlow;
      return { destinationId: destination.id, probability, expectedFlow };
    });
    byEntrance[entrance.id] = rows;
  }

  return { byEntrance, destinationArrivals, totalInflow };
}
