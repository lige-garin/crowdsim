import {
  buildGravityOdAllocation,
  type ODAllocationOptions,
  type ODDestination,
  type ODEntrance,
} from "./odEntryModel";

// Retail-first plan §4 P2 calibration framework: sensitivity + uncertainty bands.
// Run the gravity OD model over a set of parameter samples (e.g. a decay sweep or
// a perturbation ensemble) and summarise, per destination, the band of expected
// arrivals -- so analysis can show "estimate" ranges rather than a single point.
// Pure + deterministic.

export type OdUncertaintyBand = {
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
  span: number;
};

export type OdUncertaintySummary = {
  byDestination: Record<string, OdUncertaintyBand>;
  sampleCount: number;
};

// Linear-interpolated percentile over an unsorted array (p in [0, 1]).
function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) {
    return 0;
  }
  if (sortedAscending.length === 1) {
    return sortedAscending[0];
  }
  const position = p * (sortedAscending.length - 1);
  const lowIndex = Math.floor(position);
  const highIndex = Math.ceil(position);
  const fraction = position - lowIndex;
  return (
    sortedAscending[lowIndex] +
    (sortedAscending[highIndex] - sortedAscending[lowIndex]) * fraction
  );
}

export function summarizeOdUncertainty(
  entrances: readonly ODEntrance[],
  destinations: readonly ODDestination[],
  samples: readonly ODAllocationOptions[],
): OdUncertaintySummary {
  const arrivalsByDestination = new Map<string, number[]>();
  for (const destination of destinations) {
    arrivalsByDestination.set(destination.id, []);
  }

  for (const sample of samples) {
    const allocation = buildGravityOdAllocation(entrances, destinations, sample);
    for (const destination of destinations) {
      arrivalsByDestination
        .get(destination.id)!
        .push(allocation.destinationArrivals[destination.id] ?? 0);
    }
  }

  const byDestination: Record<string, OdUncertaintyBand> = {};
  for (const destination of destinations) {
    const values = [...arrivalsByDestination.get(destination.id)!].sort(
      (a, b) => a - b,
    );
    const min = values.length > 0 ? values[0] : 0;
    const max = values.length > 0 ? values[values.length - 1] : 0;
    const mean =
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
    byDestination[destination.id] = {
      min,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      max,
      mean,
      span: max - min,
    };
  }

  return { byDestination, sampleCount: samples.length };
}
