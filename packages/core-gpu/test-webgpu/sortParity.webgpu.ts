import { describe, expect, it } from "vitest";
import {
  buildSpatialHashGridCpu,
  buildSpatialHashGridGpu,
  createAgentSoA,
  createSpatialHashGridLayout,
  setAgentPosition,
} from "../src/index";
import { sortAgentsForParity } from "../src/gpuSimCore";

// Real-WebGPU parity harness (SP-1 T0). These specs self-skip when no WebGPU
// adapter is present (Node / this sandbox), so they never block CI falsely; on a
// real WebGPU machine they run the GPU sort against the CPU oracle. See README.md
// for how to enable a real device and the local/manual-gate verdict.
const maybeNavigator = globalThis.navigator as
  | (Navigator & { gpu?: GPU })
  | undefined;
const gpuTest = maybeNavigator?.gpu ? it : it.skip;

describe("sort parity (real WebGPU)", () => {
  gpuTest(
    "GPU spatial-hash sort matches the CPU oracle on a real device",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice();
      expect(device).toBeDefined();

      const agents = createAgentSoA(4);
      setAgentPosition(agents, 0, 1, 1);
      setAgentPosition(agents, 1, 11, 1);
      setAgentPosition(agents, 2, 2, 9);
      setAgentPosition(agents, 3, 19, 18);
      const layout = createSpatialHashGridLayout({
        width: 20,
        height: 20,
        cellSize: 10,
      });

      const expected = buildSpatialHashGridCpu(agents, layout);
      const actual = await buildSpatialHashGridGpu(device!, agents, layout);

      expect(Array.from(actual.cellCounts)).toEqual(
        Array.from(expected.cellCounts),
      );
      expect(Array.from(actual.cellOffsets)).toEqual(
        Array.from(expected.cellOffsets),
      );

      device!.destroy();
    },
  );

  gpuTest(
    "counting sort matches CPU offsets + per-cell buckets (1k agents)",
    async () => {
      const adapter = await maybeNavigator?.gpu?.requestAdapter();
      const device = await adapter?.requestDevice();
      expect(device).toBeDefined();

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
      const gpu = await sortAgentsForParity(device!, agents, layout);

      // cellOffsets are integer prefix sums -> must match the oracle exactly.
      expect(Array.from(gpu.cellOffsets)).toEqual(Array.from(cpu.cellOffsets));

      // Order within a cell may differ (atomic scatter) -> compare per-cell sets.
      for (let c = 0; c < layout.cellCount; c++) {
        const gpuBucket = Array.from(
          gpu.sortedAgentIds.slice(gpu.cellOffsets[c], gpu.cellOffsets[c + 1]),
        ).sort((x, y) => x - y);
        const cpuBucket = Array.from(
          cpu.sortedAgentIds.slice(cpu.cellOffsets[c], cpu.cellOffsets[c + 1]),
        ).sort((x, y) => x - y);
        expect(gpuBucket).toEqual(cpuBucket);
      }

      device!.destroy();
    },
  );
});
