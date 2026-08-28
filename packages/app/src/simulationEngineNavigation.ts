import {
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  rasterizeWallsToBlockedCells,
  type FlowField,
  type SpatialHashGridLayout,
  type WallSegment,
} from "@crowdsim/core-gpu";
import type { ScenePoint } from "@crowdsim/scene-schema";

import type { SceneWorldBounds } from "./sceneGeometry";
import type { SimulationSink } from "./simulationEngine";

const navigationCellSize = 2;

export type SinkNavigationField = {
  flowField: FlowField;
  layout: SpatialHashGridLayout;
  sinkId: string;
};

export function buildNavigationFields(
  world: SceneWorldBounds | undefined,
  walls: readonly WallSegment[],
  sinks: readonly SimulationSink[],
): SinkNavigationField[] {
  if (!world || walls.length === 0 || sinks.length === 0) {
    return [];
  }

  const layout = createSpatialHashGridLayout({
    width: world.width,
    height: world.height,
    cellSize: navigationCellSize,
  });
  const blocked = rasterizeWallsToBlockedCells(layout, [...walls]);

  return sinks.map((sink) => {
    const sinkCell = pointToCellId(sink.position, layout);
    const sinkBlocked = new Uint8Array(blocked);
    sinkBlocked[sinkCell] = 0;

    return {
      flowField: createFlowFieldCpu({
        layout,
        targetCell: sinkCell,
        blocked: sinkBlocked,
      }),
      layout,
      sinkId: sink.id,
    };
  });
}

export function pointToCellId(
  point: ScenePoint,
  layout: SpatialHashGridLayout,
): number {
  const column = clamp(Math.floor(point.x / layout.cellSize), 0, layout.columns - 1);
  const row = clamp(Math.floor(point.y / layout.cellSize), 0, layout.rows - 1);

  return row * layout.columns + column;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
