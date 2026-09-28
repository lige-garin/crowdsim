import { parseScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import { createHeatmapCellsFromSamples } from "./heatmap";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "heatmap-test",
  name: "Heatmap Test",
  world: {
    width: 20,
    height: 20,
  },
});

describe("heatmap", () => {
  it("accumulates samples inside the selected time window", () => {
    const cells = createHeatmapCellsFromSamples(
      scene,
      [
        {
          elapsedSeconds: 0,
          agents: [
            { x: 1, y: 1 },
            { x: 11, y: 1 },
          ],
        },
        {
          elapsedSeconds: 15,
          agents: [
            { x: 2, y: 2 },
            { x: 3, y: 3 },
            { x: 12, y: 2 },
          ],
        },
      ],
      {
        cellSize: 10,
        windowSeconds: 10,
      },
    );

    expect(cells.map((cell) => [cell.x, cell.y, cell.count])).toEqual([
      [0, 0, 2],
      [10, 0, 1],
    ]);
    expect(cells[0].intensity).toBe(1);
    expect(cells[1].intensity).toBe(0.5);
  });

  it("returns no cells when all samples are empty", () => {
    expect(
      createHeatmapCellsFromSamples(scene, [{ elapsedSeconds: 3, agents: [] }], {
        cellSize: 10,
        windowSeconds: 30,
      }),
    ).toEqual([]);
  });
});
