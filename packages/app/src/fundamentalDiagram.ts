export type FundamentalDiagramPoint = {
  densityPeoplePerSquareMeter: number;
  observedSpeedMetersPerSecond: number;
  referenceSpeedMetersPerSecond: number;
  speedDeltaMetersPerSecond: number;
};

export type WeidmannOptions = {
  freeFlowSpeedMetersPerSecond?: number;
  maxDensityPeoplePerSquareMeter?: number;
};

const defaultFreeFlowSpeedMetersPerSecond = 1.34;
const defaultMaxDensityPeoplePerSquareMeter = 5.4;

export function calculateWeidmannSpeed(
  densityPeoplePerSquareMeter: number,
  options: WeidmannOptions = {},
) {
  const density = Math.max(0, densityPeoplePerSquareMeter);
  const freeFlowSpeed =
    options.freeFlowSpeedMetersPerSecond ?? defaultFreeFlowSpeedMetersPerSecond;
  const maxDensity =
    options.maxDensityPeoplePerSquareMeter ?? defaultMaxDensityPeoplePerSquareMeter;

  if (density <= 0) {
    return freeFlowSpeed;
  }

  if (density >= maxDensity) {
    return 0;
  }

  return Math.max(
    0,
    freeFlowSpeed * (1 - Math.exp(-1.913 * (1 / density - 1 / maxDensity))),
  );
}

export function createFundamentalDiagramPoints(
  samples: readonly {
    densityPeoplePerSquareMeter: number;
    observedSpeedMetersPerSecond: number;
  }[],
  options: WeidmannOptions = {},
): FundamentalDiagramPoint[] {
  return samples.map((sample) => {
    const referenceSpeed = calculateWeidmannSpeed(
      sample.densityPeoplePerSquareMeter,
      options,
    );

    return {
      densityPeoplePerSquareMeter: roundDiagramValue(
        sample.densityPeoplePerSquareMeter,
      ),
      observedSpeedMetersPerSecond: roundDiagramValue(
        sample.observedSpeedMetersPerSecond,
      ),
      referenceSpeedMetersPerSecond: roundDiagramValue(referenceSpeed),
      speedDeltaMetersPerSecond: roundDiagramValue(
        sample.observedSpeedMetersPerSecond - referenceSpeed,
      ),
    };
  });
}

function roundDiagramValue(value: number) {
  return Number(value.toFixed(4));
}
