import { clamp01 } from "./agentPersona";
import type { BrandStoreCandidate } from "./brandAttraction";

export type BrandCalibrationSample = {
  observedEntryRate: number;
  predictedEntryRate: number;
  storeId: string;
};

export type BrandCalibrationResult = {
  adjustedStores: BrandStoreCandidate[];
  errors: BrandCalibrationError[];
  meanAbsoluteErrorAfter: number;
  meanAbsoluteErrorBefore: number;
};

export type BrandCalibrationError = {
  adjustedBrandPower: number;
  residualAfter: number;
  residualBefore: number;
  storeId: string;
};

export function calibrateBrandAttraction(
  stores: readonly BrandStoreCandidate[],
  samples: readonly BrandCalibrationSample[],
  learningRate = 0.45,
): BrandCalibrationResult {
  const sampleByStore = new Map(samples.map((sample) => [sample.storeId, sample]));
  const adjustedStores = stores.map((store) => {
    const sample = sampleByStore.get(store.id);

    if (!sample) {
      return store;
    }

    const residual = sample.observedEntryRate - sample.predictedEntryRate;

    return {
      ...store,
      brand: {
        ...store.brand,
        brandPower: clamp01(store.brand.brandPower + residual * learningRate),
      },
    };
  });
  const errors = adjustedStores.flatMap((store) => {
    const sample = sampleByStore.get(store.id);

    if (!sample) {
      return [];
    }

    const before = sample.observedEntryRate - sample.predictedEntryRate;
    const afterPrediction = clamp01(
      sample.predictedEntryRate +
        (store.brand.brandPower - findStore(stores, store.id).brand.brandPower) * 0.7,
    );

    return [
      {
        adjustedBrandPower: store.brand.brandPower,
        residualAfter: sample.observedEntryRate - afterPrediction,
        residualBefore: before,
        storeId: store.id,
      },
    ];
  });

  return {
    adjustedStores,
    errors,
    meanAbsoluteErrorAfter: meanAbsolute(errors.map((error) => error.residualAfter)),
    meanAbsoluteErrorBefore: meanAbsolute(errors.map((error) => error.residualBefore)),
  };
}

function findStore(stores: readonly BrandStoreCandidate[], storeId: string) {
  const store = stores.find((candidate) => candidate.id === storeId);

  if (!store) {
    throw new Error(`Unknown calibration store: ${storeId}`);
  }

  return store;
}

function meanAbsolute(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}
