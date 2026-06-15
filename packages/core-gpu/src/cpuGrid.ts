import {
  cellCenter,
  computeCellId,
  neighborCellIds,
  normalize2,
  pointToCellId,
} from "./mathUtils";
import type {
  AgentSoA,
  DensityGridReadback,
  FlowField,
  SpatialHashGridLayout,
  SpatialHashGridReadback,
  WallSegment,
} from "./types";

export function createSpatialHashGridLayout(options: {
  width: number;
  height: number;
  cellSize: number;
}): SpatialHashGridLayout {
  const { width, height, cellSize } = options;

  if (width <= 0 || height <= 0 || cellSize <= 0) {
    throw new Error("Grid width, height and cellSize must be positive");
  }

  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  return {
    width,
    height,
    cellSize,
    columns,
    rows,
    cellCount: columns * rows,
  };
}

export function computeSpatialHashCellsCpu(
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): Uint32Array {
  const cellIds = new Uint32Array(agents.count);

  for (let index = 0; index < agents.count; index++) {
    cellIds[index] = computeCellId(
      agents.positions[index * 2],
      agents.positions[index * 2 + 1],
      layout,
    );
  }

  return cellIds;
}

export function buildSpatialHashGridCpu(
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): SpatialHashGridReadback {
  const cellIds = computeSpatialHashCellsCpu(agents, layout);
  const cellCounts = new Uint32Array(layout.cellCount);
  const sortedAgentIds = new Uint32Array(agents.count);
  const cellOffsets = new Uint32Array(layout.cellCount + 1);

  for (const cellId of cellIds) {
    cellCounts[cellId]++;
  }

  for (let cell = 1; cell < cellOffsets.length; cell++) {
    cellOffsets[cell] = cellOffsets[cell - 1] + cellCounts[cell - 1];
  }

  const writeOffsets = new Uint32Array(cellOffsets);
  for (let index = 0; index < agents.count; index++) {
    const cellId = cellIds[index];
    sortedAgentIds[writeOffsets[cellId]] = index;
    writeOffsets[cellId]++;
  }

  return {
    cellIds,
    cellCounts,
    cellOffsets,
    sortedAgentIds,
  };
}

export function accumulateDensityCpu(
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): DensityGridReadback {
  const cellCounts = new Uint32Array(layout.cellCount);
  let maxCount = 0;

  for (let index = 0; index < agents.count; index++) {
    const cellId = computeCellId(
      agents.positions[index * 2],
      agents.positions[index * 2 + 1],
      layout,
    );

    cellCounts[cellId]++;
    maxCount = Math.max(maxCount, cellCounts[cellId]);
  }

  return {
    cellCounts,
    maxCount,
  };
}

export function rasterizeWallsToBlockedCells(
  layout: SpatialHashGridLayout,
  walls: WallSegment[],
): Uint8Array {
  const blocked = new Uint8Array(layout.cellCount);
  const sampleStep = layout.cellSize * 0.5;

  for (const wall of walls) {
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const samples = Math.max(1, Math.ceil(length / sampleStep));

    for (let sample = 0; sample <= samples; sample++) {
      const t = sample / samples;
      const x = wall.x1 + (wall.x2 - wall.x1) * t;
      const y = wall.y1 + (wall.y2 - wall.y1) * t;
      blocked[pointToCellId(x, y, layout)] = 1;
    }
  }

  return blocked;
}

export function createFlowFieldCpu(options: {
  layout: SpatialHashGridLayout;
  targetCell: number;
  blocked?: Uint8Array;
}): FlowField {
  const { layout, targetCell } = options;
  const blocked = options.blocked ?? new Uint8Array(layout.cellCount);
  const distances = new Float32Array(layout.cellCount);
  const directions = new Float32Array(layout.cellCount * 2);
  const queue = new Uint32Array(layout.cellCount);
  let head = 0;
  let tail = 0;

  distances.fill(Number.POSITIVE_INFINITY);

  if (targetCell >= layout.cellCount) {
    throw new Error("targetCell is outside the flow field layout");
  }

  distances[targetCell] = 0;
  queue[tail++] = targetCell;

  while (head < tail) {
    const cell = queue[head++];
    const nextDistance = distances[cell] + 1;

    for (const neighbor of neighborCellIds(cell, layout)) {
      if (blocked[neighbor] || distances[neighbor] <= nextDistance) {
        continue;
      }

      distances[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }

  for (let cell = 0; cell < layout.cellCount; cell++) {
    if (blocked[cell] || !Number.isFinite(distances[cell]) || cell === targetCell) {
      continue;
    }

    let bestCell = cell;
    let bestDistance = distances[cell];

    for (const neighbor of neighborCellIds(cell, layout)) {
      if (distances[neighbor] < bestDistance) {
        bestCell = neighbor;
        bestDistance = distances[neighbor];
      }
    }

    const from = cellCenter(cell, layout);
    const to = cellCenter(bestCell, layout);
    const direction = normalize2(to.x - from.x, to.y - from.y);

    directions[cell * 2] = direction.x;
    directions[cell * 2 + 1] = direction.y;
  }

  return {
    layout,
    targetCell,
    blocked,
    distances,
    directions,
  };
}
