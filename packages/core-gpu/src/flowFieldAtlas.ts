import { computeCellId } from "./mathUtils";
import type { AgentSoA, FlowField, SpatialHashGridLayout } from "./types";

export type FlowFieldAtlas = {
  blocked: Uint8Array;
  directions: Float32Array;
  distances: Float32Array;
  fieldCount: number;
  layout: SpatialHashGridLayout;
  targetCells: Uint32Array;
};

export function createFlowFieldAtlasCpu(
  flowFields: readonly FlowField[],
): FlowFieldAtlas {
  if (flowFields.length === 0) {
    throw new Error("Flow field atlas requires at least one field");
  }

  const layout = flowFields[0].layout;
  const cellCount = layout.cellCount;
  const directions = new Float32Array(flowFields.length * cellCount * 2);
  const distances = new Float32Array(flowFields.length * cellCount);
  const blocked = new Uint8Array(flowFields.length * cellCount);
  const targetCells = new Uint32Array(flowFields.length);

  flowFields.forEach((field, fieldIndex) => {
    assertSameLayout(layout, field.layout);
    const cellOffset = fieldIndex * cellCount;
    const directionOffset = fieldIndex * cellCount * 2;

    directions.set(field.directions, directionOffset);
    distances.set(field.distances, cellOffset);
    blocked.set(field.blocked, cellOffset);
    targetCells[fieldIndex] = field.targetCell;
  });

  return {
    blocked,
    directions,
    distances,
    fieldCount: flowFields.length,
    layout,
    targetCells,
  };
}

export function sampleFlowFieldAtlasCpu(
  agents: AgentSoA,
  atlas: FlowFieldAtlas,
): Float32Array {
  const directions = new Float32Array(agents.count * 2);

  for (let index = 0; index < agents.count; index++) {
    const fieldIndex = Math.min(agents.targetField[index], atlas.fieldCount - 1);
    const cellId = computeCellId(
      agents.positions[index * 2],
      agents.positions[index * 2 + 1],
      atlas.layout,
    );
    const atlasOffset = (fieldIndex * atlas.layout.cellCount + cellId) * 2;

    directions[index * 2] = atlas.directions[atlasOffset];
    directions[index * 2 + 1] = atlas.directions[atlasOffset + 1];
  }

  return directions;
}

export function estimateFlowFieldAtlasBytes(atlas: FlowFieldAtlas) {
  return (
    atlas.directions.byteLength +
    atlas.distances.byteLength +
    atlas.blocked.byteLength +
    atlas.targetCells.byteLength
  );
}

function assertSameLayout(
  expected: SpatialHashGridLayout,
  actual: SpatialHashGridLayout,
) {
  if (
    expected.columns !== actual.columns ||
    expected.rows !== actual.rows ||
    expected.cellSize !== actual.cellSize
  ) {
    throw new Error("Flow field atlas requires matching layouts");
  }
}
