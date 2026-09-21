import {
  accumulateDensityCpu,
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
} from "@crowdsim/core-gpu";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { fruinLevel, type FruinLevel } from "./fruinLevelOfService";

export type HeatmapAgent = {
  /** The floor they were on; absent in a scene with one floor. */
  floorId?: string;
  id?: number;
  x: number;
  y: number;
};

export type HeatmapSample = {
  elapsedSeconds: number;
  agents: readonly HeatmapAgent[];
};

/** Only the people who were on this floor; all of them in a one-floor scene. */
export function heatmapSamplesOnFloor(
  samples: readonly HeatmapSample[],
  floorId: string | undefined,
): readonly HeatmapSample[] {
  if (floorId === undefined) {
    return samples;
  }

  return samples.map((sample) => ({
    ...sample,
    agents: sample.agents.filter((agent) => agent.floorId === floorId),
  }));
}

export type HeatmapCell = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  intensity: number;
  /** Mean people per square metre over the samples in the window. */
  densityPerSquareMeter: number;
  /** Fruin walkway level of service for that density. */
  level: FruinLevel;
};

export function createHeatmapCellsFromSamples(
  scene: CrowdSimScene,
  samples: readonly HeatmapSample[],
  options: {
    cellSize?: number;
    windowSeconds: number;
  },
): HeatmapCell[] {
  if (samples.length === 0 || options.windowSeconds <= 0) {
    return [];
  }

  const latestElapsedSeconds = samples.reduce(
    (latest, sample) => Math.max(latest, sample.elapsedSeconds),
    0,
  );
  const windowStartSeconds = latestElapsedSeconds - options.windowSeconds;
  const layout = createSpatialHashGridLayout({
    width: scene.world.width,
    height: scene.world.height,
    cellSize: options.cellSize ?? 4,
  });
  const cumulativeCounts = new Uint32Array(layout.cellCount);
  let maxCount = 0;
  let samplesInWindow = 0;

  for (const sample of samples) {
    if (sample.elapsedSeconds < windowStartSeconds) {
      continue;
    }
    samplesInWindow++;
    if (sample.agents.length === 0) {
      continue;
    }

    const agents = createAgentSoA(sample.agents.length);

    sample.agents.forEach((agent, index) => {
      setAgentPosition(agents, index, agent.x, agent.y);
    });

    const density = accumulateDensityCpu(agents, layout);

    for (let cell = 0; cell < layout.cellCount; cell++) {
      cumulativeCounts[cell] += density.cellCounts[cell];
      maxCount = Math.max(maxCount, cumulativeCounts[cell]);
    }
  }

  if (maxCount === 0) {
    return [];
  }

  const cells: HeatmapCell[] = [];

  for (let cell = 0; cell < layout.cellCount; cell++) {
    const count = cumulativeCounts[cell];

    if (count === 0) {
      continue;
    }

    const column = cell % layout.columns;
    const row = Math.floor(cell / layout.columns);
    const x = column * layout.cellSize;
    const y = row * layout.cellSize;
    const densityPerSquareMeter =
      count / Math.max(1, samplesInWindow) / (layout.cellSize * layout.cellSize);

    cells.push({
      id: `heatmap-${cell}`,
      x,
      y,
      width: Math.min(layout.cellSize, scene.world.width - x),
      height: Math.min(layout.cellSize, scene.world.height - y),
      count,
      densityPerSquareMeter,
      intensity: count / maxCount,
      level: fruinLevel(densityPerSquareMeter),
    });
  }

  return cells;
}
