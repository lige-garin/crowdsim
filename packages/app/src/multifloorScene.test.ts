import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import {
  createMultiFloorScene,
  flattenMultiFloorScene,
  summarizeMultiFloorScene,
} from "./multifloorScene";

describe("multi-floor scene helpers", () => {
  it("creates, summarizes, and flattens a selected floor", () => {
    const multiFloor = createMultiFloorScene({
      connectors: [
        {
          fromFloorId: "level-1",
          id: "stairs-1",
          kind: "stairs",
          position: { x: 20, y: 20 },
          toFloorId: "level-2",
        },
      ],
      floors: [
        {
          elevationMeters: 0,
          id: "level-1",
          name: "Level 1",
          scene: demoScene,
        },
        {
          elevationMeters: 4.2,
          id: "level-2",
          name: "Level 2",
          scene: { ...demoScene, id: "atrium-level-2", name: "Atrium Level 2" },
        },
      ],
      id: "hospital-stack",
      name: "Hospital Stack",
    });

    expect(summarizeMultiFloorScene(multiFloor)).toMatchObject({
      connectorCount: 1,
      floorCount: 2,
    });
    expect(flattenMultiFloorScene(multiFloor, "level-2")).toMatchObject({
      id: "hospital-stack-level-2",
      name: "Hospital Stack / Level 2",
    });
    expect(flattenMultiFloorScene(multiFloor, "missing")).toBeNull();
  });
});
