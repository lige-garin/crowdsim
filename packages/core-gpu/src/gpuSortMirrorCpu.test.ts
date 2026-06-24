import { describe, expect, it } from "vitest";
import {
  buildSpatialHashGridCpu,
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
} from "./index";
import { gpuSortMirrorCpu } from "./gpuSortMirrorCpu";

// Validates the GPU counting-sort ALGORITHM (count -> blockScan -> cursor scatter)
// against the all-in-one oracle, in Node. WGSL still needs pnpm test:webgpu.
describe("gpuSortMirrorCpu equals buildSpatialHashGridCpu", () => {
  it("matches cellOffsets exactly and per-cell buckets as sets (1k agents)", () => {
    const agents = createAgentSoA(1024);
    for (let i = 0; i < 1024; i++) {
      setAgentPosition(agents, i, (i * 7) % 200, (i * 13) % 200);
    }
    const layout = createSpatialHashGridLayout({
      width: 200,
      height: 200,
      cellSize: 10,
    });

    const cpu = buildSpatialHashGridCpu(agents, layout);
    const mirror = gpuSortMirrorCpu(agents, layout);

    expect(Array.from(mirror.cellOffsets)).toEqual(Array.from(cpu.cellOffsets));
    for (let c = 0; c < layout.cellCount; c++) {
      const a = Array.from(
        mirror.sortedAgentIds.slice(mirror.cellOffsets[c], mirror.cellOffsets[c + 1]),
      ).sort((x, y) => x - y);
      const b = Array.from(
        cpu.sortedAgentIds.slice(cpu.cellOffsets[c], cpu.cellOffsets[c + 1]),
      ).sort((x, y) => x - y);
      expect(a).toEqual(b);
    }
  });

  it("handles a multi-block grid (cellCount > 256)", () => {
    const agents = createAgentSoA(2000);
    for (let i = 0; i < 2000; i++) {
      setAgentPosition(agents, i, (i * 3) % 400, (i * 11) % 400);
    }
    const layout = createSpatialHashGridLayout({
      width: 400,
      height: 400,
      cellSize: 10,
    }); // 40x40 = 1600 cells -> 7 scan blocks
    expect(layout.cellCount).toBeGreaterThan(256);

    const cpu = buildSpatialHashGridCpu(agents, layout);
    const mirror = gpuSortMirrorCpu(agents, layout);
    expect(Array.from(mirror.cellOffsets)).toEqual(Array.from(cpu.cellOffsets));
  });
});
