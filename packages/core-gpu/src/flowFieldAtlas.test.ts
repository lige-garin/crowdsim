import { describe, expect, it } from "vitest";
import {
  createAgentSoA,
  createFlowFieldAtlasCpu,
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  estimateFlowFieldAtlasBytes,
  sampleFlowFieldAtlasCpu,
  setAgentPosition,
  setAgentTargetField,
} from "./index";

describe("flow field atlas", () => {
  it("packs multiple flow fields and samples by agent targetField", () => {
    const layout = createSpatialHashGridLayout({
      cellSize: 1,
      height: 1,
      width: 3,
    });
    const atlas = createFlowFieldAtlasCpu([
      createFlowFieldCpu({ layout, targetCell: 2 }),
      createFlowFieldCpu({ layout, targetCell: 0 }),
    ]);
    const agents = createAgentSoA(2);

    setAgentPosition(agents, 0, 1.5, 0.5);
    setAgentTargetField(agents, 0, 0);
    setAgentPosition(agents, 1, 1.5, 0.5);
    setAgentTargetField(agents, 1, 1);

    expect(atlas.fieldCount).toBe(2);
    expect(Array.from(atlas.targetCells)).toEqual([2, 0]);
    expect(estimateFlowFieldAtlasBytes(atlas)).toBeGreaterThan(0);
    expect(Array.from(sampleFlowFieldAtlasCpu(agents, atlas))).toEqual([1, 0, -1, 0]);
  });

  it("rejects flow fields with different layouts", () => {
    const first = createSpatialHashGridLayout({
      cellSize: 1,
      height: 1,
      width: 3,
    });
    const second = createSpatialHashGridLayout({
      cellSize: 2,
      height: 2,
      width: 4,
    });

    expect(() =>
      createFlowFieldAtlasCpu([
        createFlowFieldCpu({ layout: first, targetCell: 2 }),
        createFlowFieldCpu({ layout: second, targetCell: 0 }),
      ]),
    ).toThrow("matching layouts");
  });
});
