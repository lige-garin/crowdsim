import { blockScanReference } from "./blockScanReference";
import { computeCellId } from "./mathUtils";
import type { AgentSoA, SpatialHashGridLayout } from "./types";

// CPU mirror of the GPU counting sort (gpuSimCoreShaders.ts count -> scan ->
// scatter): per-cell count, blockScanReference for the exclusive offsets, then an
// atomic-style per-cell cursor scatter -- exactly the data flow of the three GPU
// passes. Lets the full sort ALGORITHM (incl. the cursor scatter, which the scan
// cross-check did not cover) be validated in Node against buildSpatialHashGridCpu.
// It does NOT verify the WGSL itself (still needs `pnpm test:webgpu`).
export function gpuSortMirrorCpu(
  agents: AgentSoA,
  layout: SpatialHashGridLayout,
): { cellOffsets: Uint32Array; sortedAgentIds: Uint32Array } {
  const cellCounts = new Uint32Array(layout.cellCount);
  const cellIds = new Uint32Array(agents.count);
  for (let i = 0; i < agents.count; i++) {
    const cell = computeCellId(
      agents.positions[i * 2],
      agents.positions[i * 2 + 1],
      layout,
    );
    cellIds[i] = cell;
    cellCounts[cell]++;
  }

  const cellOffsets = blockScanReference(cellCounts, 256);

  const cursor = new Uint32Array(layout.cellCount);
  const sortedAgentIds = new Uint32Array(agents.count);
  for (let i = 0; i < agents.count; i++) {
    const cell = cellIds[i];
    const slot = cellOffsets[cell] + cursor[cell];
    cursor[cell]++;
    sortedAgentIds[slot] = i;
  }

  return { cellOffsets, sortedAgentIds };
}
